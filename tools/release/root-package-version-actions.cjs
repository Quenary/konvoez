// Version actions for the fixed "server" release: the single source of truth
// for the app version is the root package.json (read by apps/backend/webpack.config.js).
const { VersionActions } = require('nx/release');

const ROOT_MANIFESTS = ['package.json', 'package-lock.json'];

class RootPackageVersionActions extends VersionActions {
  validManifestFilenames = null; // projects have no own manifest to validate

  async readCurrentVersionFromSourceManifest() {
    return null; // current version comes from git tags (currentVersionResolver: git-tag)
  }

  async readCurrentVersionFromRegistry() {
    return null;
  }

  async readCurrentVersionOfDependency() {
    return { currentVersion: null, dependencyCollection: null };
  }

  async updateProjectDependencies() {
    return [];
  }

  // Called once per project of the fixed group with the same version; writes are idempotent.
  async updateProjectVersion(tree, newVersion) {
    const logs = [];
    for (const file of ROOT_MANIFESTS) {
      if (!tree.exists(file)) continue;
      const json = JSON.parse(tree.read(file, 'utf-8'));
      if (json.version === newVersion) continue;
      json.version = newVersion;
      if (file === 'package-lock.json' && json.packages?.['']) {
        json.packages[''].version = newVersion;
      }
      tree.write(file, JSON.stringify(json, null, 2) + '\n');
      logs.push(`✍️  ${file}: version → ${newVersion}`);
    }
    return logs;
  }
}

module.exports = RootPackageVersionActions;
module.exports.default = RootPackageVersionActions;
