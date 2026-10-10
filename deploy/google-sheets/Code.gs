/**
 * Thabaal → Google Sheet live log (Apps Script, bound to the client's spreadsheet).
 *
 * The portal POSTs { event, data, secret? } to this web app. Each kind of event has its own tab:
 *   Live Orders        one row per order, updated in place as its status changes
 *   Order History      every order event (new, confirmed, paid, dispatched…), as a log
 *   Chats              incoming WhatsApp messages
 *   Button Clicks      buttons customers tapped
 *   Campaign Messages  one row per campaign message, status updated as WhatsApp reports it
 *   Other Events       anything new the portal starts sending, so nothing is lost
 *
 * "Customers" and "Orders" are the tabs the portal READS (staff type rows there). This script never
 * writes to them, so nothing it logs is imported back into the portal twice.
 *
 * Setup: paste this file, run `setup` once (it creates the tabs and clears old test rows), then
 * Deploy → Manage deployments → Edit → Version: New version → Deploy (keeps the same /exec URL).
 * Optional: Project Settings → Script properties → SECRET = the same value as the portal's
 * GOOGLE_SHEET_WEBHOOK_SECRET, so only the portal can write.
 */

var VERSION = "thabaal-sheet v2";
var TZ = "Asia/Kolkata";

var TABS = {
  orders: { name: "Live Orders", head: ["Order ID", "Created", "Last update", "Status", "Customer", "Phone", "Items", "Total (₹)", "Paid", "Address / note", "Client"], text: [1, 6] },
  orderLog: { name: "Order History", head: ["Time", "Order ID", "Event", "Status", "Customer", "Phone", "Total (₹)", "Client"], text: [2, 6] },
  chats: { name: "Chats", head: ["Time", "Phone", "Customer", "Message", "Source", "Client"], text: [2] },
  clicks: { name: "Button Clicks", head: ["Time", "Phone", "Customer", "Button", "Action", "Campaign", "Client"], text: [2] },
  campaign: { name: "Campaign Messages", head: ["First seen", "Last update", "Template / campaign", "Phone", "Status", "WhatsApp message ID", "Client"], text: [4, 6] },
  other: { name: "Other Events", head: ["Time", "Event", "Data"], text: [] },
};

/** The tabs the portal imports from; kept, with the headings it understands. */
var IMPORT_TABS = {
  Customers: ["Name", "Phone", "Area", "Tags", "Buys", "Opted out"],
  Orders: ["Order No", "Date", "Phone", "Name", "Item", "Qty", "Price", "Address", "Status"],
};

/** Tabs from the earlier version of this script, replaced by the ones above. */
var OLD_TABS = ["New Leads & Chats"];

function now_() {
  return Utilities.formatDate(new Date(), TZ, "yyyy-MM-dd HH:mm:ss");
}

/** The tab with its heading row, created and formatted if it's missing. */
function tab_(def) {
  var ss = SpreadsheetApp.getActive();
  var sh = ss.getSheetByName(def.name);
  if (!sh) {
    sh = ss.insertSheet(def.name);
    sh.getRange(1, 1, 1, def.head.length).setValues([def.head]).setFontWeight("bold").setBackground("#e8f5f0");
    sh.setFrozenRows(1);
    // Phone numbers and IDs stay text, so Sheets doesn't turn them into 9.18E+11.
    def.text.forEach(function (c) {
      sh.getRange(2, c, sh.getMaxRows() - 1, 1).setNumberFormat("@");
    });
    sh.autoResizeColumns(1, def.head.length);
  }
  return sh;
}

/** Row number of `id` in column `col`, or 0. */
function findRow_(sh, col, id) {
  if (!id || sh.getLastRow() < 2) return 0;
  var hit = sh.getRange(2, col, sh.getLastRow() - 1, 1).createTextFinder(String(id)).matchEntireCell(true).findNext();
  return hit ? hit.getRow() : 0;
}

function json_(obj) {
  return ContentService.createTextOutput(JSON.stringify(obj)).setMimeType(ContentService.MimeType.JSON);
}

/** Health check: the portal team can open the /exec URL to see this version is live. */
function doGet() {
  return json_({ status: "ok", version: VERSION, tabs: Object.keys(TABS).map(function (k) { return TABS[k].name; }) });
}

function doPost(e) {
  var body;
  try {
    body = JSON.parse(e.postData.contents);
  } catch (err) {
    return json_({ status: "error", message: "Body must be JSON" });
  }
  var secret = PropertiesService.getScriptProperties().getProperty("SECRET");
  if (secret && body.secret !== secret) return json_({ status: "error", message: "Unauthorised" });

  var event = String(body.event || "");
  var d = body.data || {};
  var t = now_();
  // One write at a time, so two updates to the same order can't both add a row.
  var lock = LockService.getScriptLock();
  lock.waitLock(20000);
  try {
    if (event === "NEW_ORDER" || event === "ORDER_UPDATE") {
      var sh = tab_(TABS.orders);
      var row = [d.orderId || "", d.created || t, t, d.status || "", d.name || "", d.phone || "", d.items || "", Number(d.total) || 0, d.paid || "", d.address || "", d.client || ""];
      var r = findRow_(sh, 1, d.orderId);
      if (r) {
        row[1] = sh.getRange(r, 2).getValue() || row[1]; // keep the original created time
        sh.getRange(r, 1, 1, row.length).setValues([row]);
      } else {
        sh.appendRow(row);
      }
      tab_(TABS.orderLog).appendRow([t, d.orderId || "", event === "NEW_ORDER" ? "New order" : d.change || "Updated", d.status || "", d.name || "", d.phone || "", Number(d.total) || 0, d.client || ""]);
    } else if (event === "NEW_CHAT") {
      tab_(TABS.chats).appendRow([t, d.phone || "", d.name || "", d.message || "", d.source || "", d.client || ""]);
    } else if (event === "BUTTON_CLICK") {
      tab_(TABS.clicks).appendRow([t, d.phone || "", d.name || "", d.buttonText || "", d.actionValue || "", d.campaign || "", d.client || ""]);
    } else if (event === "CAMPAIGN_STATUS") {
      var cs = tab_(TABS.campaign);
      var cr = findRow_(cs, 6, d.waMessageId);
      if (cr) {
        cs.getRange(cr, 2).setValue(t);
        cs.getRange(cr, 5).setValue(d.status || "");
      } else {
        cs.appendRow([t, t, d.campaign || "", d.phone || "", d.status || "", d.waMessageId || "", d.client || ""]);
      }
    } else {
      tab_(TABS.other).appendRow([t, event, JSON.stringify(d)]);
    }
  } finally {
    lock.releaseLock();
  }
  return json_({ status: "success", event: event, timestamp: t, version: VERSION });
}

/**
 * Run once from the editor (select `setup`, press Run). Creates every tab, clears old and test rows
 * from them, removes the previous version's tabs, and gives the import tabs their headings.
 */
function setup() {
  var ss = SpreadsheetApp.getActive();
  Object.keys(TABS).forEach(function (k) {
    var sh = tab_(TABS[k]);
    if (sh.getLastRow() > 1) sh.deleteRows(2, sh.getLastRow() - 1);
  });
  Object.keys(IMPORT_TABS).forEach(function (name) {
    var sh = ss.getSheetByName(name) || ss.insertSheet(name);
    var head = IMPORT_TABS[name];
    sh.getRange(1, 1, 1, head.length).setValues([head]).setFontWeight("bold").setBackground("#fdf6dc");
    sh.setFrozenRows(1);
  });
  OLD_TABS.forEach(function (name) {
    var sh = ss.getSheetByName(name);
    if (sh && ss.getSheets().length > 1) ss.deleteSheet(sh);
  });
  return "Ready: " + VERSION;
}
