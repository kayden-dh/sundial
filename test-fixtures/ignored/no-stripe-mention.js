// FAKE CODE for testing Sundial. A dashboard settings module that happens to
// use the names display_items and aggregate_usage. It has nothing to do with
// the payments library, and never names it, so nothing here should be flagged.
const settings = {
  display_items: 25,
  aggregate_usage: "sum",
};

function pageSize(config) {
  return config.display_items ?? settings.display_items;
}

module.exports = { settings, pageSize };
