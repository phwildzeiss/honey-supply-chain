// SPDX-License-Identifier: MIT
pragma solidity ^0.8.34;

import "@openzeppelin/contracts/access/AccessControl.sol";

contract ActorRegistry is AccessControl {
    bytes32 public constant BEEKEEPER_ROLE = keccak256("BEEKEEPER_ROLE");
    bytes32 public constant LAB_ROLE = keccak256("LAB_ROLE");
    bytes32 public constant CERTIFICATION_BODY_ROLE =
        keccak256("CERTIFICATION_BODY_ROLE");
    bytes32 public constant AWARD_BODY_ROLE = keccak256("AWARD_BODY_ROLE");
    bytes32 public constant BOTTLER_ROLE = keccak256("BOTTLER_ROLE");
    bytes32 public constant LOGISTICS_ROLE = keccak256("LOGISTICS_ROLE");
    bytes32 public constant RETAILER_ROLE = keccak256("RETAILER_ROLE");

    struct Actor {
        string name;
        bool registered;
    }

    mapping(address => Actor) public actors;
    mapping(address => string) public certifications;

    constructor() {
        _grantRole(DEFAULT_ADMIN_ROLE, msg.sender);
    }

    function registerActor(
        address actorAddress,
        string calldata name
    ) external onlyRole(DEFAULT_ADMIN_ROLE) {
        actors[actorAddress] = Actor(name, true);
    }

    function setCertification(
        address actorAddress,
        string calldata ipfsCid
    ) external onlyRole(CERTIFICATION_BODY_ROLE) {
        certifications[actorAddress] = ipfsCid;
    }

    function getActor(
        address actorAddress
    ) external view returns (Actor memory) {
        return actors[actorAddress];
    }
}
