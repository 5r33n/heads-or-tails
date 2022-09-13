const { ethers, network } = require("hardhat")

console.log("[FILE] mockOffchain.js")

async function mockKeepers() {
    console.log("[OK] Mocking Keepers...")
    const hot = await ethers.getContract("Hot")
    const checkData = ethers.utils.keccak256(ethers.utils.toUtf8Bytes(""))
    const { upkeepNeeded } = await hot.callStatic.checkUpkeep(checkData)
    if (upkeepNeeded) {
        const tx = await hot.performUpkeep(checkData)
        const txReceipt = await tx.wait(1)
        const requestId = txReceipt.events[1].args.requestId
        console.log(`[OK] Performed upkeep with RequestId: ${requestId}`)
        if (network.config.chainId == 31337) {
            await mockVrf(requestId, hot)
        }
    } else {
        console.log("[INFO] No upkeep needed!")
    }
}

async function mockVrf(requestId, hot) {
    console.log("[OK] Mocking VRF on Local Network...")
    const vrfCoordinatorV2Mock = await ethers.getContract("VRFCoordinatorV2Mock")
    await vrfCoordinatorV2Mock.fulfillRandomWords(requestId, hot.address)
    console.log("[OK] fulfillRandomWords responded!")
    const recentWinner = await hot.getRecentWinner()
    console.log(`[OK] Is it heads or tails: ${recentWinner}`)
}

mockKeepers()
    .then(() => process.exit(0))
    .catch((error) => {
        console.error(error)
        process.exit(1)
    })
