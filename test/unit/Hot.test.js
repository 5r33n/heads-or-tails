const { getNamedAccounts, ethers, network } = require("hardhat")
const { developmentChains, networkConfig } = require("../../helper-hardhat-config")
const { assert, expect } = require("chai")

!developmentChains.includes(network.name)
    ? describe.skip
    : describe("HoT Unit Tests", function () {
          let hot, vrfCoordinatorV2Mock, hotEntranceFee, deployer, interval, isHeads, isTails
          const chainId = network.config.chainId

          beforeEach(async function () {
              deployer = (await getNamedAccounts()).deployer
              await deployments.fixture(["all"])
              hot = await ethers.getContract("Hot", deployer)
              vrfCoordinatorV2Mock = await ethers.getContract("VRFCoordinatorV2Mock", deployer)
              hotEntranceFee = await hot.getEntranceFee()
              interval = await hot.getInterval()
              isHeads = 0
              isTails = 1
          })

          describe("constructor", function () {
              it("initializes the hot correctly", async function () {
                  // ideally we make our tests have just ONE assert per 'it'
                  const hotState = await hot.getHotState()
                  assert.equal(hotState.toString(), "0")
                  assert.equal(interval.toString(), networkConfig[chainId]["interval"])
              })
          })

          describe("enterHot", function () {
              it("reverts when you don't pay enuff", async function () {
                  await expect(hot.enterHot(0)).to.be.revertedWith("Hot__NotEnoughETHEntered")
              })
              it("records players who chose Heads when they enter", async function () {
                  await hot.enterHot(isHeads, { value: hotEntranceFee })
                  const headerFromContract = await hot.getHeader(0)
                  assert.equal(headerFromContract, deployer)
              })
              it("records players who chose Tails when they enter", async function () {
                  await hot.enterHot(isTails, { value: hotEntranceFee })
                  const tailerFromContract = await hot.getTailer(0)
                  assert.equal(tailerFromContract, deployer)
              })
              it("emits event on enter", async function () {
                  await expect(hot.enterHot(isHeads, { value: hotEntranceFee })).to.emit(
                      hot,
                      "HotEnter"
                  )
              })
              it("doesn't allow entrance when hot is in calculating state", async function () {
                  await hot.enterHot(isHeads, { value: hotEntranceFee })
                  await network.provider.send("evm_increaseTime", [interval.toNumber() + 1])
                  await network.provider.send("evm_mine", [])
                  // pretend to be a Chainlink keeper
                  await hot.performUpkeep([])
                  await expect(hot.enterHot(isHeads, { value: hotEntranceFee })).to.be.revertedWith(
                      "Hot__NotOpen"
                  )
              })
          })
          describe("checkUpkeep", function () {
              it("returns false if ppl haven't sent any ETH", async function () {
                  await network.provider.send("evm_increaseTime", [interval.toNumber() + 1])
                  await network.provider.send("evm_mine", [])
                  const { upkeepNeeded } = await hot.callStatic.checkUpkeep([])
                  assert(!upkeepNeeded)
              })
              it("returns false if hot is in calculating state", async function () {
                  await hot.enterHot(isHeads, { value: hotEntranceFee })
                  await network.provider.send("evm_increaseTime", [interval.toNumber() + 1])
                  await network.provider.send("evm_mine", [])
                  await hot.performUpkeep([])
                  const hotState = await hot.getHotState()
                  const { upkeepNeeded } = await hot.callStatic.checkUpkeep([])
                  assert.equal(hotState.toString(), "1")
                  assert.equal(upkeepNeeded, false)
              })
              it("returns false if enough time hasn't passed", async function () {
                  await hot.enterHot(isHeads, { value: hotEntranceFee })
                  await network.provider.send("evm_increaseTime", [interval.toNumber() - 1])
                  await network.provider.send("evm_mine", [])
                  // or: await network.provider.request({method: "evm_increaseTime", params: []})
                  const { upkeepNeeded } = await hot.callStatic.checkUpkeep("0x")
                  // or: await network.provider.send("evm_mine", [])
                  assert(!upkeepNeeded)
              })
              it("returns true if enough time has passed, has players, eth, and is open", async function () {
                  await hot.enterHot(isHeads, { value: hotEntranceFee })
                  await network.provider.send("evm_increaseTime", [interval.toNumber() + 1])
                  await network.provider.send("evm_mine", [])
                  const { upkeepNeeded } = await hot.callStatic.checkUpkeep("0x")
                  assert(upkeepNeeded)
              })
          })

          describe("performUpkeep", function () {
              it("can only run if checkUpkeep is true", async function () {
                  await hot.enterHot(isHeads, { value: hotEntranceFee })
                  await network.provider.send("evm_increaseTime", [interval.toNumber() + 1])
                  await network.provider.send("evm_mine", [])
                  const tx = hot.performUpkeep([])
                  assert(tx)
              })
              it("reverts when checkUpkeep is false", async function () {
                  await expect(hot.performUpkeep([])).to.be.revertedWith("Hot__UpkeepNotNeeded")
              })
              it("updates the hot state, emits an event, and calls the vrf coordinator", async function () {
                  await hot.enterHot(isHeads, { value: hotEntranceFee })
                  await network.provider.send("evm_increaseTime", [interval.toNumber() + 1])
                  await network.provider.send("evm_mine", [])
                  const txResponse = await hot.performUpkeep([])
                  const txReceipt = await txResponse.wait(1)
                  const requestId = await txReceipt.events[1].args.requestId
                  const hotState = await hot.getHotState()
                  assert(requestId.toNumber() > 0)
                  assert(hotState.toString() == "1")
              })
          })

          describe("fulfillRandomWords", function () {
              beforeEach(async function () {
                  await hot.enterHot(isHeads, { value: hotEntranceFee })
                  await network.provider.send("evm_increaseTime", [interval.toNumber() + 1])
                  await network.provider.send("evm_mine", [])
              })
              it("can only be called after performUpkeep", async function () {
                  await expect(
                      vrfCoordinatorV2Mock.fulfillRandomWords(0, hot.address)
                  ).to.be.revertedWith("nonexistent request")
                  await expect(
                      vrfCoordinatorV2Mock.fulfillRandomWords(1, hot.address)
                  ).to.be.revertedWith("nonexistent request")
                  // fuzz testing is better than this
              })
              it("flips a coin, resets the lottery, and sends the money", async function () {
                  const additionalEntrants = 3
                  const startingAccountIndex = 1 // deployer index = 0
                  const accounts = await ethers.getSigners()
                  for (
                      let i = startingAccountIndex;
                      i < startingAccountIndex + additionalEntrants;
                      i++
                  ) {
                      const accountConnectedHot = hot.connect(accounts[i])
                      await accountConnectedHot.enterHot(isHeads, { value: hotEntranceFee })
                  }
                  const startingTimeStamp = await hot.getLatestTimeStamp()

                  // performUpkeep (mock being chainlink keepers)
                  // fulfillRandomWords (mock being chainlink vrf)
                  // we'll have to wait for the fulfillRandomWords to be called
                  await new Promise(async (resolve, reject) => {
                      // listen for event 'WinnerPicked'
                      hot.once("HotResult", async () => {
                          //   console.log("Found the event!")
                          try {
                              const recentFlip = await hot.getRecentFlip()
                              console.log("recent flip:", recentFlip.toString())
                              console.log("[0] deployer:", accounts[0].address)
                              console.log("[1]", accounts[1].address)
                              console.log("[2]", accounts[2].address)
                              console.log("[3]", accounts[3].address)
                              const hotState = await hot.getHotState()
                              const endingTimeStamp = await hot.getLatestTimeStamp()
                              const numPlayers = await hot.getNumberOfPlayers()
                              const winnerEndingBalance = await accounts[1].getBalance()
                              assert(numPlayers.toString(), "0")
                              assert(hotState.toString(), "0")
                              assert(endingTimeStamp > startingTimeStamp)
                              //   assert.equal(
                              //       winnerEndingBalance.toString(),
                              //       winnerStartingBalance
                              //           .add(
                              //               hotEntranceFee.mul(additionalEntrants).add(hotEntranceFee)
                              //           )
                              //           .toString()
                              //   )
                          } catch (e) {
                              reject(e)
                          }
                          resolve()
                      })

                      // fire the event, and the listener above will pick it up and resolve
                      // chainlink keepers mock
                      const tx = await hot.performUpkeep([])
                      const txReceipt = await tx.wait(1)
                      const winnerStartingBalance = await accounts[1].getBalance()
                      // chainlink vrf mock
                      await vrfCoordinatorV2Mock.fulfillRandomWords(
                          txReceipt.events[1].args.requestId,
                          hot.address
                      )
                  })
              })
          })
      })
