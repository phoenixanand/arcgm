import { ethers, network } from "hardhat";
import fs from "fs";
import path from "path";

const NETWORK_CONFIG = {
  arcTestnet: {
    chainId: 5042002n,
    name: "Arc Testnet",
    explorer: "https://testnet.arcscan.app",
  },

  arcMainnet: {
    chainId: 5042n,
    name: "Arc Mainnet",
    explorer: "https://explorer.arc.io",
  },
} as const;

async function main() {
  const [deployer] = await ethers.getSigners();
  const net = await ethers.provider.getNetwork();

  /*
   * 1. Make sure the selected Hardhat network is supported
   */
  const config =
    NETWORK_CONFIG[network.name as keyof typeof NETWORK_CONFIG];

  if (!config) {
    throw new Error(
      `Unsupported network "${network.name}". ` +
        `Use --network arcTestnet or --network arcMainnet.`
    );
  }

  /*
   * 2. Safety check: connected chain must match the selected network
   */
  if (net.chainId !== config.chainId) {
    throw new Error(
      `Refusing to deploy: connected chainId is ${net.chainId}, ` +
        `but ${network.name} expects ${config.chainId}. ` +
        `Check hardhat.config.ts and the --network flag.`
    );
  }

  console.log("======================================");
  console.log("ArcGM Deployment");
  console.log("======================================");
  console.log("Network:", config.name);
  console.log("Hardhat network:", network.name);
  console.log("Chain ID:", net.chainId.toString());
  console.log("Deployer:", deployer.address);

  /*
   * 3. Deploy ArcGM
   */
  console.log("\nDeploying ArcGM...");

  const ArcGM = await ethers.getContractFactory("ArcGM");
  const gm = await ArcGM.deploy(deployer.address);

  await gm.waitForDeployment();

  const gmAddress = await gm.getAddress();

  console.log("ArcGM deployed:");
  console.log(gmAddress);

  /*
   * 4. Deploy MilestoneBadges
   */
  console.log("\nDeploying MilestoneBadges...");

  const MilestoneBadges =
    await ethers.getContractFactory("MilestoneBadges");

  const badges = await MilestoneBadges.deploy(gmAddress);

  await badges.waitForDeployment();

  const badgesAddress = await badges.getAddress();

  console.log("MilestoneBadges deployed:");
  console.log(badgesAddress);

  /*
   * 5. Connect ArcGM -> MilestoneBadges
   */
  console.log("\nConnecting ArcGM to MilestoneBadges...");

  const connectTx = await gm.setMilestoneBadges(badgesAddress);

  console.log("setMilestoneBadges tx:", connectTx.hash);

  await connectTx.wait();

  /*
   * Verify connection
   */
  const connectedBadges = await gm.milestoneBadges();

  if (
    connectedBadges.toLowerCase() !== badgesAddress.toLowerCase()
  ) {
    throw new Error(
      `Post-deploy check failed: gm.milestoneBadges() returned ` +
        `${connectedBadges}, expected ${badgesAddress}.`
    );
  }

  console.log("MilestoneBadges connected successfully.");

  /*
   * 6. Deploy ProfileRegistry
   */
  console.log("\nDeploying ProfileRegistry...");

  const ProfileRegistry =
    await ethers.getContractFactory("ProfileRegistry");

  const profileRegistry = await ProfileRegistry.deploy();

  await profileRegistry.waitForDeployment();

  const profileRegistryAddress =
    await profileRegistry.getAddress();

  console.log("ProfileRegistry deployed:");
  console.log(profileRegistryAddress);

  /*
   * 7. Deploy TemplateDeployer
   */
  console.log("\nDeploying TemplateDeployer...");

  const TemplateDeployer =
    await ethers.getContractFactory("TemplateDeployer");

  const templateDeployer =
    await TemplateDeployer.deploy();

  await templateDeployer.waitForDeployment();

  const templateDeployerAddress =
    await templateDeployer.getAddress();

  console.log("TemplateDeployer deployed:");
  console.log(templateDeployerAddress);

  /*
   * 8. Save deployment information
   *
   * Testnet:
   * deployments/arcTestnet.json
   *
   * Mainnet:
   * deployments/arcMainnet.json
   */
  const deployment = {
    network: network.name,
    chainId: Number(net.chainId),
    deployer: deployer.address,

    ArcGM: gmAddress,
    MilestoneBadges: badgesAddress,
    ProfileRegistry: profileRegistryAddress,
    TemplateDeployer: templateDeployerAddress,

    timestamp: new Date().toISOString(),
  };

  const deploymentDir = path.join(
    __dirname,
    "../deployments"
  );

  if (!fs.existsSync(deploymentDir)) {
    fs.mkdirSync(deploymentDir, { recursive: true });
  }

  const deploymentFile = path.join(
    deploymentDir,
    `${network.name}.json`
  );

  fs.writeFileSync(
    deploymentFile,
    JSON.stringify(deployment, null, 2)
  );

  /*
   * 9. Final output
   */
  console.log("\n======================================");
  console.log("DEPLOYMENT COMPLETE");
  console.log("======================================");

  console.log("\nNetwork:");
  console.log(config.name);

  console.log("\nChain ID:");
  console.log(net.chainId.toString());

  console.log("\nArcGM:");
  console.log(gmAddress);

  console.log("\nMilestoneBadges:");
  console.log(badgesAddress);

  console.log("\nProfileRegistry:");
  console.log(profileRegistryAddress);

  console.log("\nTemplateDeployer:");
  console.log(templateDeployerAddress);

  console.log("\nArcGM Explorer:");
  console.log(
    `${config.explorer}/address/${gmAddress}`
  );

  console.log("\nMilestoneBadges Explorer:");
  console.log(
    `${config.explorer}/address/${badgesAddress}`
  );

  console.log("\nProfileRegistry Explorer:");
  console.log(
    `${config.explorer}/address/${profileRegistryAddress}`
  );

  console.log("\nTemplateDeployer Explorer:");
  console.log(
    `${config.explorer}/address/${templateDeployerAddress}`
  );

  console.log("\nDeployment file:");
  console.log(deploymentFile);

  console.log(
    "\nRemember to update the frontend contract addresses, " +
      "networks configuration, and subgraph/indexer configuration " +
      "with the addresses from this deployment."
  );
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});