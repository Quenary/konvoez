const DefaultChangelogRenderer =
  require('nx/release/changelog-renderer').default;

class ServerChangelogRenderer extends DefaultChangelogRenderer {
  filterChanges(changes) {
    return changes; // fixed group: one entry for backend+frontend+shared
  }
}

module.exports = ServerChangelogRenderer;
