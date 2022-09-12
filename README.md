# Heads or Tails (HoT)
Players are going to deposit ETH and choose one of two options of Heads or Tails. On 00:00 UTC, every night, Chainlink Keeper is going to check for a winner using Chainlink VRF Coordinator. The winners are going to get paid with the following formula.
```math
w=(\frac{T_l}{T_w}+1)b
```