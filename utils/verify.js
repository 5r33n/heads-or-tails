const { run } = require("hardhat")

const verify = async (contractAddress, args) => {
    try {
        await run("verify:verify", {
            address: contractAddress,
            constructorArguments: args,
        })
        console.log("[OK] Verification complete!")
    } catch (e) {
        if (e.message.toLowerCase().includes("already verified")) {
            console.log("[INFO] Already verified!")
        } else {
            console.log(e)
        }
    }
}

module.exports = {
    verify,
}
