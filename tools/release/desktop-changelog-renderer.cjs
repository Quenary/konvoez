const DefaultChangelogRenderer =
  require('nx/release/changelog-renderer').default;

class DesktopChangelogRenderer extends DefaultChangelogRenderer {
  filterChanges(changes) {
    return changes.filter(
      (c) =>
        c.scope === 'desktop' ||
        (Array.isArray(c.affectedProjects) &&
          c.affectedProjects.includes('desktop')),
    );
  }
}

module.exports = DesktopChangelogRenderer;
