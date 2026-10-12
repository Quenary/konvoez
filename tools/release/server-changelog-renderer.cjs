const DefaultChangelogRenderer =
  require('nx/release/changelog-renderer').default;

const EXCLUDED_SCOPES = ['desktop', 'client-shell', 'ui-kit', 'client-dialogs'];

class ServerChangelogRenderer extends DefaultChangelogRenderer {
  filterChanges(changes) {
    return changes.filter(
      (c) =>
        !EXCLUDED_SCOPES.includes(c.scope) &&
        (c.affectedProjects === '*' ||
          c.affectedProjects?.some((p) =>
            ['backend', 'frontend', 'shared'].includes(p),
          )),
    );
  }
}

module.exports = ServerChangelogRenderer;
