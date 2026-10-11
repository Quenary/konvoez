const DefaultChangelogRenderer =
  require('nx/release/changelog-renderer').default;

const DESKTOP_GROUP_PROJECTS = [
  'desktop',
  'client-shell',
  'ui-kit',
  'client-dialogs',
];
const DESKTOP_GROUP_SCOPES = [
  'desktop',
  'client-shell',
  'ui-kit',
  'client-dialogs',
];

class DesktopChangelogRenderer extends DefaultChangelogRenderer {
  filterChanges(changes) {
    return changes.filter(
      (c) =>
        DESKTOP_GROUP_SCOPES.includes(c.scope) ||
        (Array.isArray(c.affectedProjects) &&
          c.affectedProjects.some((p) => DESKTOP_GROUP_PROJECTS.includes(p))),
    );
  }
}

module.exports = DesktopChangelogRenderer;
