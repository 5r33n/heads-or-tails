const { ethers } = require("hardhat")

async function enterHot() {
    console.log("[FILE] enter.js")
    console.log("[OK] Entering Hot...")
    const hot = await ethers.getContract("Hot")
    const entranceFee = await hot.getEntranceFee()
    await hot.enterHot({ value: entranceFee + 1 })
    console.log("[OK] Entering Hot completed!")
}

enterHot()
    .then(() => process.exit(0))
    .catch((error) => {
        console.error(error)
        process.exit(1)
    })
