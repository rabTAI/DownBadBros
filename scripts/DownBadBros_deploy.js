const hre = require("hardhat");

async function main() {
    const [deployer] = await hre.ethers.getSigners();
    console.log(
        "Deploying contracts with the account:",
        deployer.address
    );
    console.log("Account balance:", (await deployer.getBalance()).toString());

    const downBadBros = await hre.ethers.getContractFactory("DownBadBros");
    console.log('Deploying DownBadBros...');
    const token = await downBadBros.deploy();

    await token.deployed();
    console.log("DownBadBros deployed to:", token.address);
}

main()
    .then(() => process.exit(0))
    .catch((error) => {
        console.error(error);
        process.exit(1);
    });