function updatePageAction(tab) {
  browser.tabs.executeScript(tab.id, {"code": "1"}).then(() => {
    browser.pageAction.show(tab.id);
  }).catch(() => {
    browser.pageAction.hide(tab.id);
  });
}

// call updatePageAction for all tabs on each load
browser.tabs.query({}).then((tabs) => {
  for (let tab of tabs) {
    updatePageAction(tab);
  }
});

// call updatePageAction when tabs are updated
browser.tabs.onUpdated.addListener((id, changeInfo, tab) => {
  updatePageAction(tab);
});

browser.pageAction.onClicked.addListener((tab) => {
  browser.tabs.executeScript(tab.id, {"code": `(() => {
    if (window.latest_es_response) {
      try {
        response_json = window.latest_es_response.responses.map(response => JSON.parse(response)["responses"][0]);
      } catch (e) {
        window.alert("Sniffed data couldn't be parsed as JSON. Perhaps we sniffed the wrong thing?");
        return;
      }

      try {
        var len = response_json.map(r => r["hits"]["hits"].length).reduce((a, b) => a + b);
        if (len === 0) {
          window.alert("No log entries in this dataset. Can't diagram.");
          return;
        } else if (
          len < 100
          || window.confirm("This dataset consists of " + len + " log entries. Are you sure you want to diagram it?")
        ) {
          return response_json;
        }
      } catch (e) {
        window.alert("Sniffed data wasn't in expected format. Perhaps we sniffed the wrong thing?");
        return;
      }
    }
  })();`}).then((response_data) => {
    if (response_data[0] != null) {
      browser.tabs.create({
        "url": "/index.html"
      }).then((tab) => {
        browser.tabs.sendMessage(
          tab.id,
          {setSrcDataJson: JSON.stringify(response_data[0])}
        );
      });
    }
  });
});

browser.webNavigation.onDOMContentLoaded.addListener((details) => {
  browser.tabs.executeScript(details.tabId, {file: "browser-polyfill.js"});
  browser.tabs.executeScript(details.tabId, {
    "code": `(() => {
      // set up content-script to maintain this easily accessible copy of most recently retrieved es response
      // based on custom events sent by the page script
      window.latest_es_response = null;
      document.addEventListener("kibanaesresponse", (event) => {
        if (event.detail && event.detail.response) {
          // we use the second line of the request as a "characteristic string" in an attempt to identify responses
          // that are part of the same query. if the characteristic string matches that of the existing es response
          // we've stored, we simply append it. else we completely replace it.
          var request_cstr = (event.detail.request || "").split("\\n", 2)[1] || "";
          if (window.latest_es_response && window.latest_es_response.request_cstr === request_cstr) {
            window.latest_es_response.responses.push(event.detail.response);
          } else {
            window.latest_es_response = {
              "request_cstr": request_cstr,
              "responses": [event.detail.response]
            };
          }
        }
      });

      // set up our XMLHttpRequest monkeypatcher to run in page-context
      var s = document.createElement('script');
      s.src = "${browser.runtime.getURL('xhr-monkeypatcher.js')}";
      s.onload = function() {
        // tidy ourselves up - no need to be left around
        this.remove();
      };
      (document.head || document.documentElement).appendChild(s);
    })();`,
    "runAt": "document_end"
  })
}, {
  "url": [{"urlPrefix": "https://kibana.logit.io/"}]
});