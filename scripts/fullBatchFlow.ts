import { network } from "hardhat";
import { mkdirSync, writeFileSync } from "node:fs";
import HoneySupplyChainModule from "../ignition/modules/HoneySupplyChain.js";

const SIMULATOR_URL = process.env.SIMULATOR_URL ?? "http://127.0.0.1:8081/api";
const GENERATED_RUNS = Number(process.env.GENERATED_RUNS ?? 5);
const SEED = Number(process.env.SEED ?? 42);
const SCENARIO_FILTER = process.env.SCENARIO_FILTER ?? ""; // only run scenarios whose name contains this text
const ETH_EUR = Number(process.env.ETH_EUR ?? 2500); // assumption, no market data
const GWEI_ASSUMPTIONS = [5, 20, 50]; // assumptions for the cost calculation
const JAR_GRAMS = 500;
const FLOOR_PRICE_CENTS = 480;
const ALPHA = 8000;

const STATIONS: Record<number, { name: string; distance: number }> = {
  1: { name: "Bienenstand_1", distance: 120 },
  2: { name: "Bienenstand_2", distance: 350 },
  3: { name: "Bienenstand_3", distance: 620 },
  4: { name: "Bienenstand_4", distance: 180 },
  5: { name: "Bienenstand_5", distance: 280 },
  6: { name: "Bienenstand_6", distance: 150 },
};
const SI_KEYS = ["forage", "lightIntensity", "waterSource", "summerTemperature",
  "winterTemperature", "windSpeed", "humidity", "precipitation"] as const;
const STATES = ["Active", "RetestRequired", "NotSellable"];
const REASONS = ["None", "WaterContentExceeded", "TemperatureViolation"];
const REGIONS = ["EU_NON_EU_MIX", "EU_MIX", "NATIONAL", "REGIONAL_GPS_VERIFIED"];
const REGION_WEIGHTS = [0.1, 0.1, 0.3, 0.5];

// FULL: beekeeper -> logistics -> bottler -> logistics -> retailer (4 custody transfers)
// BEEKEEPER_TO_RETAILER: beekeeper bottles himself -> logistics -> retailer (2 custody transfers)
// DIRECT: direct marketing, the beekeeper does everything himself, no transfers
type Chain = "FULL" | "BEEKEEPER_TO_RETAILER" | "DIRECT";
const CHAINS: Chain[] = ["FULL", "BEEKEEPER_TO_RETAILER", "DIRECT"];
const CHAIN_WEIGHTS = [0.6, 0.2, 0.2];

type Row = Record<string, string | number>;
type Stand = { standId: number; grams: number; distance: number };
type Scenario = {
  name: string;
  chain?: Chain; // default FULL
  stands: Stand[];
  lab: { force?: string; variety?: string };
  region: string;
  award?: string;
  certification?: string;
  transportForce?: string;
  defrostForce?: string;
  retest?: boolean;
};

function mulberry32(seed: number) {
  let a = seed;
  return () => {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function pickWeighted<T>(rand: () => number, values: T[], weights: number[]): T {
  let roll = rand();
  for (let i = 0; i < values.length; i++) {
    if ((roll -= weights[i]) < 0) return values[i];
  }
  return values[values.length - 1];
}

const referenceStand = (id: number, grams = 25000): Stand => ({ standId: id, grams, distance: STATIONS[id].distance });

const PROFILES: Record<string, Omit<Scenario, "name" | "stands">> = {
  "S-I": { lab: { force: "PREMIUM" }, region: "REGIONAL_GPS_VERIFIED", award: "GOLD", certification: "ASSOCIATION_ORGANIC" },
  "S-II": { lab: { force: "STANDARD", variety: "MIXED_BLOSSOM" }, region: "REGIONAL_GPS_VERIFIED", award: "NONE", certification: "NONE" },
  "S-III": { lab: { force: "PHQI_EXCLUDED", variety: "MIXED_BLOSSOM" }, region: "EU_NON_EU_MIX", award: "NONE", certification: "NONE" },
  "S-IV": { lab: { force: "GATEKEEPER", variety: "PREMIUM_VARIETAL" }, region: "REGIONAL_GPS_VERIFIED", award: "GOLD", certification: "ASSOCIATION_ORGANIC" },
};

function buildScenarios(): Scenario[] {
  const scenarios: Scenario[] = [];
  for (const [key, profile] of Object.entries(PROFILES)) {
    for (const stationId of [1, 5, 3]) {
      scenarios.push({ name: `${key}/BS-${stationId}`, stands: [referenceStand(stationId)],
        ...profile, transportForce: "NORMAL", defrostForce: "NORMAL" });
    }
  }
  scenarios.push({ name: "COLD_CHAIN/BS-1", stands: [referenceStand(1)], ...PROFILES["S-II"],
    transportForce: "VIOLATION", defrostForce: "NORMAL", retest: true });
  scenarios.push({ name: "MIXED/BS-1+BS-3", stands: [referenceStand(1, 15000), referenceStand(3, 10000)],
    ...PROFILES["S-I"], transportForce: "NORMAL", defrostForce: "NORMAL" });
  for (const chain of ["BEEKEEPER_TO_RETAILER", "DIRECT"] as Chain[]) {
    scenarios.push({ name: `CHAIN-${chain}/BS-1`, chain, stands: [referenceStand(1)], ...PROFILES["S-II"],
      transportForce: "NORMAL", defrostForce: "NORMAL" });
  }

  const rand = mulberry32(SEED);
  for (let i = 1; i <= GENERATED_RUNS; i++) {
    const stationId = 1 + Math.floor(rand() * 6);
    const grams = (10 + Math.floor(rand() * 41)) * 500; // 5-25 kg
    const region = pickWeighted(rand, REGIONS, REGION_WEIGHTS);
    const chain = pickWeighted(rand, CHAINS, CHAIN_WEIGHTS);
    scenarios.push({ name: `GENERATED/${i}`, chain, stands: [{ standId: stationId, grams, distance: 50 + Math.floor(rand() * 750) }],
      lab: { force: "NORMAL" }, region });
  }
  return scenarios.filter((s) => s.name.includes(SCENARIO_FILTER));
}

const { ethers, ignition } = await network.create({ network: "localhost" });
const [admin, lab, awardBody, certBody, beekeeper, bottler, retailer, logistics] = await ethers.getSigners();
const { actorRegistry, honeyToken, qualityIndex, supplyChain, consumerGateway } =
  await ignition.deploy(HoneySupplyChainModule);

async function bootstrap() {
  // The beekeeper also holds BOTTLER_ROLE and RETAILER_ROLE for the shortened chains (bottling himself, direct marketing).
  const grants: [string, string][] = [
    ["LAB_ROLE", lab.address], ["AWARD_BODY_ROLE", awardBody.address], ["CERTIFICATION_BODY_ROLE", certBody.address],
    ["BEEKEEPER_ROLE", beekeeper.address], ["BOTTLER_ROLE", beekeeper.address], ["RETAILER_ROLE", beekeeper.address],
    ["BOTTLER_ROLE", bottler.address], ["RETAILER_ROLE", retailer.address], ["LOGISTICS_ROLE", logistics.address],
  ];
  for (const [roleName, address] of grants) {
    const role = await (actorRegistry as any)[roleName]();
    if (!(await actorRegistry.hasRole(role, address))) {
      await (await actorRegistry.connect(admin).grantRole(role, address)).wait();
    }
  }
  const names: [string, string][] = [
    [beekeeper.address, "Imkerei Mustermann"], [bottler.address, "Abfuellbetrieb Honigmanufaktur"],
    [retailer.address, "Bio-Laden Eisenstadt"], [logistics.address, "Spedition Schnell"],
  ];
  for (const [address, name] of names) {
    if (!(await actorRegistry.getActor(address)).registered) {
      await (await actorRegistry.connect(admin).registerActor(address, name)).wait();
    }
  }
  // Every holder that passes the batch on needs to approve SupplyChain for the token transfer.
  for (const holder of [beekeeper, bottler, logistics]) {
    await (await honeyToken.connect(holder).setApprovalForAll(await supplyChain.getAddress(), true)).wait();
  }
}

async function post(path: string, body?: unknown): Promise<any> {
  const response = await fetch(`${SIMULATOR_URL}${path}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  if (!response.ok) throw new Error(`${path} -> HTTP ${response.status}: ${await response.text()}`);
  return response.json();
}

const sensorPath = (kind: string, force?: string) => `/sensors/${kind}${force ? `?force=${force}` : ""}`;

async function snapshot(batchId: bigint): Promise<Row> {
  const q = await consumerGateway.getQualityData(batchId);
  let priceCents: string | number = "not sellable";
  try {
    priceCents = Number(await consumerGateway.getPrice(batchId, JAR_GRAMS));
  } catch { /* NotSellable: getPrice reverts */ }
  const [si, phqi, mci] = [Number(q.si), Number(q.phqi), Number(q.mci)];
  const expectedQi = Math.floor((5396 * phqi + 2970 * mci + 1634 * si) / 10000);
  const expectedPrice = Math.floor((FLOOR_PRICE_CENTS * (1e8 + ALPHA * Number(q.qi))) / 1e8);
  return { si, phqi, mci, qi: Number(q.qi), state: STATES[Number(q.state)], reason: REASONS[Number(q.reason)], priceCents,
    expectedQi, qiDeviation: Number(q.qi) - expectedQi,
    expectedPriceCents: expectedPrice, priceDeviation: typeof priceCents === "number" ? priceCents - expectedPrice : "" };
}

async function runBatch(runNo: number, scenario: Scenario, steps: Row[]): Promise<Row> {
  const runSteps: Row[] = [];
  let batchId = 0n;
  const gasByActor: Record<string, number> = {};
  const chain = scenario.chain ?? "FULL";

  async function record(step: string, actor: string, txHash: string, durationMs: number,
                        timings: { renderMs: number; uploadMs: number; chainMs: number }) {
    const receipt = await ethers.provider.getTransactionReceipt(txHash);
    const gas = Number(receipt!.gasUsed);
    gasByActor[actor] = (gasByActor[actor] ?? 0) + gas;
    const total = Math.round(durationMs);
    const row: Row = { run: runNo, scenario: scenario.name, chain, step, actor, txHash, gasUsed: gas,
      gasPriceWei: receipt!.gasPrice.toString(), feeWei: receipt!.fee.toString(), durationMs: total,
      renderMs: timings.renderMs, uploadMs: timings.uploadMs, chainMs: timings.chainMs,
      otherMs: total - timings.renderMs - timings.uploadMs - timings.chainMs };
    if (batchId > 0n) Object.assign(row, await snapshot(batchId));
    runSteps.push(row);
    steps.push(row);
    return row;
  }
  // A transaction sent by the runner itself: the whole duration is on-chain time.
  async function onChain(step: string, actor: string, send: () => Promise<any>) {
    const t0 = performance.now();
    const tx = await send();
    await tx.wait();
    const durationMs = performance.now() - t0;
    return record(step, actor, tx.hash, durationMs, { renderMs: 0, uploadMs: 0, chainMs: Math.round(durationMs) });
  }
  // A transaction sent by the simulator (lab, award body, certification body); it reports its own phase timings.
  async function viaSimulator(step: string, actor: string, path: string, body: unknown) {
    const t0 = performance.now();
    const result = await post(path, body);
    const row = await record(step, actor, result.transactionHash, performance.now() - t0, result.timings);
    row.note = result.ipfsCid ? `cid=${result.ipfsCid}` : "";
    return result;
  }
  // Logistics takes over the batch, records the transport conditions as its current holder and hands it on.
  async function transportLeg(from: typeof beekeeper, fromName: string, to: string, toName: string, force?: string) {
    await onChain(`transferCustody(${fromName}->logistics)`, fromName, () =>
      supplyChain.connect(from).transferCustody(batchId, logistics.address));
    const reading = await post(sensorPath("transport", force));
    await onChain("recordTransportData", "logistics", () =>
      supplyChain.connect(logistics).recordTransportData(batchId, reading.temperatureCelsius, reading.durationMinutes));
    await onChain(`transferCustody(logistics->${toName})`, "logistics", () =>
      supplyChain.connect(logistics).transferCustody(batchId, to));
  }

  const grams = scenario.stands.reduce((sum, s) => sum + s.grams, 0);
  const jars = Math.floor(grams / JAR_GRAMS);

  // Fetch the SI first: if the simulator cannot deliver it, no batch has been registered yet.
  const siResponses: any[] = [];
  for (const stand of scenario.stands) {
    siResponses.push(await post("/si", { sensorStation: STATIONS[stand.standId].name, waterSourceDistanceMeters: stand.distance }));
  }
  // The SI is linear in its inputs, so a mixed batch gets the quantity-weighted mean of its stands.
  const si = Object.fromEntries(SI_KEYS.map((key) => [key,
    Math.round(scenario.stands.reduce((sum, s, i) => sum + siResponses[i][key] * s.grams, 0) / grams)]));

  await viaSimulator("certification", "certBody", "/certifications",
    { beekeeperAddress: beekeeper.address, force: scenario.certification });

  batchId = await supplyChain.nextBatchId();
  await onChain("registerHarvestBatch", "beekeeper", () =>
    supplyChain.connect(beekeeper).registerHarvestBatch(
      2026, scenario.stands.map((s) => s.standId), scenario.stands.map((s) => s.grams)));

  await onChain("submitSIData", "beekeeper", () => qualityIndex.connect(beekeeper).submitSIData(batchId, si));

  const labResult = await viaSimulator("labAnalysis", "lab", "/lab/analysis",
    { batchId: Number(batchId), force: scenario.lab.force, variety: scenario.lab.variety });

  const origin = await post("/mci/origin", { variety: labResult.reportData.variety, region: scenario.region });
  await onChain("submitMCIOriginData", "beekeeper", () => qualityIndex.connect(beekeeper).submitMCIOriginData(batchId, origin.region));

  await viaSimulator("award", "awardBody", "/awards", { batchId: Number(batchId), force: scenario.award });

  // Who bottles: the bottler in the full chain, otherwise the beekeeper.
  const processor = chain === "FULL" ? bottler : beekeeper;
  const processorName = chain === "FULL" ? "bottler" : "beekeeper";

  if (chain === "FULL") {
    await transportLeg(beekeeper, "beekeeper", bottler.address, "bottler", scenario.transportForce);
    if (scenario.retest) {
      await viaSimulator("labRetest", "lab", "/lab/analysis",
        { batchId: Number(batchId), force: scenario.lab.force, variety: scenario.lab.variety });
    }
  }

  const defrost = await post(sensorPath("defrost", scenario.defrostForce));
  await onChain("recordWarehouseData(defrost)", processorName, () =>
    supplyChain.connect(processor).recordWarehouseData(batchId, defrost.temperatureCelsius, defrost.durationMinutes));
  await onChain("processAndBottle", processorName, () =>
    supplyChain.connect(processor).processAndBottle(batchId, [JAR_GRAMS], [jars]));

  if (chain === "DIRECT") {
    await onChain("recordRetailReceipt", "beekeeper", () => supplyChain.connect(beekeeper).recordRetailReceipt(batchId));
  } else {
    // In the COLD_CHAIN scenario the second leg runs without a violation, otherwise the retest would be undone at once.
    const lastLegForce = chain === "FULL" && scenario.retest ? "NORMAL" : scenario.transportForce;
    await transportLeg(processor, processorName, retailer.address, "retailer", lastLegForce);
    await onChain("recordRetailReceipt", "retailer", () => supplyChain.connect(retailer).recordRetailReceipt(batchId));
  }

  const t0 = performance.now();
  const final = await snapshot(batchId);
  const consumerQueryMs = Math.round(performance.now() - t0);

  const sum = (key: string) => runSteps.reduce((total, r) => total + Number(r[key]), 0);
  const totalGas = sum("gasUsed");
  const summary: Row = { run: runNo, scenario: scenario.name, chain, batchId: Number(batchId), grams, jars,
    custodyTransfers: runSteps.filter((r) => String(r.step).startsWith("transferCustody")).length,
    totalGas, ...Object.fromEntries(Object.entries(gasByActor).map(([a, g]) => [`gas_${a}`, g])),
    offChainMs: sum("renderMs") + sum("uploadMs"), onChainMs: sum("chainMs"),
    finalQi: final.qi, finalState: final.state, finalPriceCents: final.priceCents, consumerQueryMs };
  summary.upliftEurPerJar = typeof final.priceCents === "number" ? (final.priceCents - FLOOR_PRICE_CENTS) / 100 : "";
  for (const gwei of GWEI_ASSUMPTIONS) {
    const costEur = totalGas * gwei * 1e-9 * ETH_EUR;
    summary[`costEurPerJar_${gwei}gwei`] = Number((costEur / jars).toFixed(4));
  }
  summary.ethEurAssumption = ETH_EUR;
  return summary;
}

function toCsv(rows: Row[]): string {
  const headers = [...new Set(rows.flatMap((r) => Object.keys(r)))];
  const cell = (v: unknown) => `"${String(v ?? "").replaceAll('"', '""')}"`;
  return [headers.join(","), ...rows.map((r) => headers.map((h) => cell(r[h])).join(","))].join("\n");
}

await bootstrap();
const steps: Row[] = [];
const runs: Row[] = [];
const scenarios = buildScenarios();
for (const [index, scenario] of scenarios.entries()) {
  console.log(`[${index + 1}/${scenarios.length}] ${scenario.name} (${scenario.chain ?? "FULL"})`);
  try {
    runs.push(await runBatch(index + 1, scenario, steps));
  } catch (error) {
    console.error(`  FAILED: ${(error as Error).message}`);
    runs.push({ run: index + 1, scenario: scenario.name, error: (error as Error).message });
  }
}

const dir = `results/${new Date().toISOString().replaceAll(":", "-")}`;
mkdirSync(dir, { recursive: true });
writeFileSync(`${dir}/steps.csv`, toCsv(steps));
writeFileSync(`${dir}/runs.csv`, toCsv(runs));
writeFileSync(`${dir}/raw.json`, JSON.stringify({ steps, runs }, null, 2));
console.log(`\nResults in ${dir}`);
