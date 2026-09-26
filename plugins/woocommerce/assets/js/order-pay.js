/* BSA Gate — WooCommerce order-pay flow (USDC / EIP-3009, EVM wallet). */
(function () {
  "use strict";
  var CFG = window.BSAGATE_PAY;
  var mount = document.getElementById("bsagate-pay");
  if (!CFG || !mount) return;

  function el(html) { var d = document.createElement("div"); d.innerHTML = html.trim(); return d.firstChild; }
  function status(msg, kind) { statusEl.textContent = msg; statusEl.className = "bsagate-status " + (kind || ""); }

  mount.appendChild(el(
    '<div class="bsagate-card">' +
      '<h3>Pay with USDC on Ethereum</h3>' +
      '<p class="bsagate-sub">You will sign a gasless authorization. BSA Gate checks your on-chain identity, screens the payment, then settles.</p>' +
      '<label class="bsagate-label">Your BSA Gate name<input id="bsagate-ens" type="text" value="alice.bsagate.eth" spellcheck="false"></label>' +
      '<button id="bsagate-btn" class="bsagate-btn">Connect wallet &amp; pay</button>' +
      '<p id="bsagate-status" class="bsagate-status"></p>' +
    '</div>'
  ));
  var btn = document.getElementById("bsagate-btn");
  var statusEl = document.getElementById("bsagate-status");
  var ensInput = document.getElementById("bsagate-ens");

  function randomNonce() {
    var b = new Uint8Array(32);
    (window.crypto || {}).getRandomValues(b);
    var s = "0x";
    for (var i = 0; i < b.length; i++) s += b[i].toString(16).padStart(2, "0");
    return s;
  }

  async function ensureChain(eth) {
    var want = "0x" + Number(CFG.chainId).toString(16);
    var cur = await eth.request({ method: "eth_chainId" });
    if (cur === want) return;
    try {
      await eth.request({ method: "wallet_switchEthereumChain", params: [{ chainId: want }] });
    } catch (e) {
      throw new Error("Please switch your wallet to chain " + CFG.chainId + " (Sepolia).");
    }
  }

  async function pay() {
    btn.disabled = true;
    try {
      var eth = window.ethereum;
      if (!eth) throw new Error("No EVM wallet found. Install MetaMask.");
      status("Connecting wallet…");
      var accounts = await eth.request({ method: "eth_requestAccounts" });
      var from = accounts[0];
      await ensureChain(eth);

      var now = Math.floor(Date.now() / 1000);
      var message = {
        from: from,
        to: CFG.payTo,
        value: String(CFG.amountBaseUnits),
        validAfter: "0",
        validBefore: String(now + 3600),
        nonce: randomNonce(),
      };
      var typedData = {
        types: {
          EIP712Domain: [
            { name: "name", type: "string" },
            { name: "version", type: "string" },
            { name: "chainId", type: "uint256" },
            { name: "verifyingContract", type: "address" },
          ],
          TransferWithAuthorization: [
            { name: "from", type: "address" },
            { name: "to", type: "address" },
            { name: "value", type: "uint256" },
            { name: "validAfter", type: "uint256" },
            { name: "validBefore", type: "uint256" },
            { name: "nonce", type: "bytes32" },
          ],
        },
        domain: CFG.domain,
        primaryType: "TransferWithAuthorization",
        message: message,
      };

      status("Sign the payment authorization in your wallet…");
      var signature = await eth.request({
        method: "eth_signTypedData_v4",
        params: [from, JSON.stringify(typedData)],
      });

      status("Submitting to BSA Gate…");
      var res = await fetch(CFG.restUrl + "settle", {
        method: "POST",
        headers: { "Content-Type": "application/json", "X-WP-Nonce": CFG.nonce },
        body: JSON.stringify({
          order_id: CFG.orderId,
          order_key: CFG.orderKey,
          ens_name: ensInput.value.trim(),
          authorization: Object.assign({ signature: signature }, message),
        }),
      });
      var out = await res.json();
      if (out.paid) {
        status("Payment settled ✓ Redirecting…", "ok");
        window.location.href = out.redirect || CFG.thankYouUrl;
      } else {
        status(out.error || "Payment was not approved.", "err");
        btn.disabled = false;
      }
    } catch (e) {
      status((e && e.message) || String(e), "err");
      btn.disabled = false;
    }
  }

  btn.addEventListener("click", pay);
})();
