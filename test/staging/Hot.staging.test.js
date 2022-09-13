const { getNamedAccounts, ethers, network } = require("hardhat")
const { developmentChains } = require("../../helper-hardhat-config")
const { assert, expect } = require("chai")

developmentChains.includes(network.name)
    ? describe.skip
    : describe("Hot Staging Tests", function () {
          let hot, hotEntranceFee, deployer

          beforeEach(async function () {
              deployer = (await getNamedAccounts()).deployer
              hot = await ethers.getContract("Hot", deployer)
              hotEntranceFee = await hot.getEntranceFee()
          })

          describe("fulfillRandomWords", function () {
              it("works with live Chainlink Keepers and Chainlink VRF, we get a random winner", async function () {
                  const startingTimeStamp = await hot.getLatestTimeStamp()
                  const accounts = await ethers.getSigners()

                  await new Promise(async (resolve, reject) => {
                      // setup listener before entering the hot
                      // just in case the blockchain moves really fast
                      hot.once("WinnerPicked", async () => {
                          try {
                              // asserts here
                              const recentWinner = await hot.getRecentWinner()
                              const hotState = await hot.getHotState()
                              const winnerEndingBalance = await accounts[0].getBalance() // same deployer
                              const endingTimeStamp = await hot.getLatestTimeStamp()

                              // check if hot is reset
                              await expect(hot.getPlayer(0)).to.be.reverted
                              assert.equal(recentWinner.toString(), accounts[0].address)
                              assert.equal(hotState, 0)
                              assert.equal(
                                  winnerEndingBalance.toString(),
                                  winnerStartingBalance.add(hotEntranceFee).toString()
                              )
                              assert(endingTimeStamp > startingTimeStamp)
                              resolve()
                          } catch (e) {
                              reject(e)
                          }
                      })

                      // then enter
                      const tx = await hot.enterHot({ value: hotEntranceFee })
                      await tx.wait(1)
                      const winnerStartingBalance = await accounts[0].getBalance()
                  })
              })
          })
      })
