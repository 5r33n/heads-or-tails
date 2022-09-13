const { developmentChains } = require("../helper-hardhat-config")

const BASE_FEE = ethers.utils.parseEther("0.25") // premium: 0.25 LINK
const GAS_PRICE_LINK = 1e9

module.exports = async function ({ getNamedAccounts, deployments }) {
    const { deploy, log } = deployments
    const { deployer } = await getNamedAccounts()
    const args = [BASE_FEE, GAS_PRICE_LINK]

    log("------------------------------------------------------")
    log("[FILE] 00-deploy-mock.js")

    if (developmentChains.includes(network.name)) {
        log("[INFO] Local Network detected!")

        await deploy("VRFCoordinatorV2Mock", {
            from: deployer,
            log: true,
            args: args,
        })

        log("[OK] Mocks deployed!")
    } else {
        log("[INFO] Remote Network detected!")
        log("[EXIT] Exitting file w/o doing anything really ^^")
    }
    log("------------------------------------------------------")
}

module.exports.tags = ["all", "mocks"]
