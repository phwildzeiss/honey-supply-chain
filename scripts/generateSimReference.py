import json
import sys
from pathlib import Path

SIM_ROOT = Path(r"D:\15-Qnap\Florianis\01-Philipp\Studium\CloudComputing\Masterarbeit\simulation - Kopie")
sys.path.insert(0, str(SIM_ROOT))

from qi.qi import QI  # noqa: E402
from phqi.phqi_iteration_2 import PHQIIteration2  # noqa: E402
from mci.mci import MCI  # noqa: E402
from pricing.price_model_iteration_2 import PriceModel  # noqa: E402

FLOOR_PRICE_EUR = 4.80

SI_BY_STATION = {
    1: 0.7830,
    2: 0.5083,
    3: 0.3907,
    4: 0.7698,
    5: 0.5512,
    6: 0.7567,
}

qi_model = QI()
phqi_model = PHQIIteration2()
mci_model = MCI()


def weighted_si(stands):
    total = sum(grams for _, grams in stands)
    return sum(SI_BY_STATION[station] * grams for station, grams in stands) / total


RETEST_HMF_INCREASE_MG_PER_KG = 5.0
RETEST_INVERTASE_DECREASE_U_PER_KG = 10.0


def degrade_for_retest(raw):
    return dict(
        water_content=raw["water_content"],
        hmf=raw["hmf"] + RETEST_HMF_INCREASE_MG_PER_KG,
        invertase=max(0.0, raw["invertase"] - RETEST_INVERTASE_DECREASE_U_PER_KG),
        naturally_enzyme_weak=raw["naturally_enzyme_weak"],
    )


LAB_RAW_BY_FORCE = {
    "PREMIUM": dict(water_content=15.0, hmf=5.0, invertase=100.0, naturally_enzyme_weak=False),
    "STANDARD": dict(water_content=17.5, hmf=12.0, invertase=75.0, naturally_enzyme_weak=False),
    "GATEKEEPER": dict(water_content=24.0, hmf=12.0, invertase=75.0, naturally_enzyme_weak=False),
    "PHQI_EXCLUDED": dict(water_content=21.0, hmf=12.0, invertase=75.0, naturally_enzyme_weak=False),
}

PROFILES = {
    "S-I": dict(lab_force="PREMIUM", variety="fir honey", origin="regional",
                certification="association organic", award="gold"),
    "S-II": dict(lab_force="STANDARD", variety="mixed blossom honey", origin="regional",
                 certification=None, award=None),
    "S-III": dict(lab_force="GATEKEEPER", variety="mixed blossom honey", origin="eu/non-eu mixture",
                  certification=None, award=None),
    "S-IV": dict(lab_force="PHQI_EXCLUDED", variety="fir honey", origin="regional",
                 certification="association organic", award="gold"),
}

SCENARIOS = {
    "F-1": ("S-I", [(1, 25000)]),
    "F-1/BS-5": ("S-I", [(5, 25000)]),
    "F-1/BS-3": ("S-I", [(3, 25000)]),
    "F-2": ("S-II", [(1, 25000)]),
    "F-2/BS-5": ("S-II", [(5, 25000)]),
    "F-2/BS-3": ("S-II", [(3, 25000)]),
    "F-3": ("S-III", [(1, 25000)]),
    "F-3/BS-5": ("S-III", [(5, 25000)]),
    "F-3/BS-3": ("S-III", [(3, 25000)]),
    "F-4": ("S-IV", [(1, 25000)]),
    "F-4/BS-5": ("S-IV", [(5, 25000)]),
    "F-4/BS-3": ("S-IV", [(3, 25000)]),
    "F-5": ("S-II", [(1, 25000)]),
    "F-6": ("S-II", [(1, 15000), (3, 10000)]),
    "F-7": ("S-II", [(1, 25000)]),
}


def compute(profile_key, stands, lab_raw_override=None):
    profile = PROFILES[profile_key]
    si = weighted_si(stands)
    lab_raw = lab_raw_override if lab_raw_override is not None else LAB_RAW_BY_FORCE[profile["lab_force"]]
    phqi = phqi_model.calculate(**lab_raw)
    mci = mci_model.calculate(
        variety=profile["variety"],
        origin=profile["origin"],
        certification=profile["certification"],
        award=profile["award"],
    )
    qi = qi_model.calculate(phqi=phqi, mci=mci, si=si)
    not_sellable = lab_raw["water_content"] > 23.0
    price = None if not_sellable else PriceModel.calculate_price(FLOOR_PRICE_EUR, qi)
    return {
        "si": round(si, 4),
        "phqi": round(phqi, 4),
        "mci": round(mci, 4),
        "qi": round(qi, 4),
        "notSellable": not_sellable,
        "priceEur": None if price is None else round(price, 4),
        "priceCents": None if price is None else round(price * 100),
    }


def main():
    result = {
        "_source": {
            "generatedAt": "2026-10-24",
            "pythonProject": str(SIM_ROOT),
            "modules": [
                "qi/qi.py: QI.calculate",
                "phqi/phqi_iteration_2.py: PHQIIteration2.calculate",
                "mci/mci.py: MCI.calculate",
                "pricing/price_model_iteration_2.py: PriceModel.calculate_price",
            ],
            "note": "SI-Werte aus Kapitel 5.2 der Arbeit (bereits validiert, nicht neu berechnet). "
                    "Lab-Rohwerte sind repraesentative Werte je Force-Ergebnis (Bucket-Grenzen aus "
                    "LabReportGenerator.java), kein Zufall.",
        },
        "weights": {
            "qi": list(qi_model.weights),
            "mci": {
                "variety": MCI.VARIETY_WEIGHT,
                "origin": MCI.ORIGIN_WEIGHT,
                "certification": MCI.CERTIFICATION_WEIGHT,
                "award": MCI.AWARD_WEIGHT,
            },
        },
        "scenarios": {
            **{key: compute(profile_key, stands) for key, (profile_key, stands) in SCENARIOS.items() if key != "F-5"},
            "F-5_preRetest": compute(*SCENARIOS["F-5"]),
            "F-5": compute(
                SCENARIOS["F-5"][0], SCENARIOS["F-5"][1],
                lab_raw_override=degrade_for_retest(LAB_RAW_BY_FORCE[PROFILES[SCENARIOS["F-5"][0]]["lab_force"]]),
            ),
        },
    }
    out_path = Path(__file__).parent / "simReference.json"
    out_path.write_text(json.dumps(result, indent=2), encoding="utf-8")
    print(f"Wrote {out_path}")
    for key, value in result["scenarios"].items():
        print(f"  {key}: QI={value['qi']} price={value['priceCents']}c notSellable={value['notSellable']}")


if __name__ == "__main__":
    main()
