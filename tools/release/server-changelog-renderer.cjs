const DefaultChangelogRenderer =
  require('nx/release/changelog-renderer').default;

class ServerChangelogRenderer extends DefaultChangelogRenderer {
  filterChanges(changes) {
    return changes.filter(
      (c) =>
        c.scope !== 'desktop' &&
        (c.affectedProjects === '*' ||
          c.affectedProjects?.some((p) =>
            ['backend', 'frontend', 'shared'].includes(p),
          )),
    );
  }
}

module.exports = ServerChangelogRenderer;
