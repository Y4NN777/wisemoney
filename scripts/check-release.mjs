import { readFile } from "node:fs/promises";
import { resolve } from "node:path";

const root = process.cwd();
const readJson = async (path) => JSON.parse(await readFile(resolve(root, path), "utf8"));

const [rootPackage, webPackage, releases, changelog] = await Promise.all([
  readJson("package.json"),
  readJson("apps/web/package.json"),
  readJson("apps/web/src/releases/releases.json"),
  readFile(resolve(root, "CHANGELOG.md"), "utf8"),
]);

const errors = [];
const semver = /^\d+\.\d+\.\d+$/;
const isoDate = /^\d{4}-\d{2}-\d{2}$/;

if (!Array.isArray(releases) || releases.length === 0) {
  errors.push("apps/web/src/releases/releases.json must contain at least one release");
} else {
  const current = releases[0];
  if (rootPackage.version !== webPackage.version) {
    errors.push(`package versions differ: root=${rootPackage.version}, web=${webPackage.version}`);
  }
  if (current.version !== rootPackage.version) {
    errors.push(`latest public release ${current.version} does not match package version ${rootPackage.version}`);
  }
  const escapedVersion = current.version.replaceAll(".", "\\.");
  const changelogHeading = new RegExp(
    `^## \\[${escapedVersion}\\](?:\\([^\\n]+\\))? (?:- ${current.releasedAt}|\\(${current.releasedAt}\\))$`,
    "m",
  );
  if (!changelogHeading.test(changelog)) {
    errors.push(`CHANGELOG.md is missing a ${current.version} heading dated ${current.releasedAt}`);
  }
  if (changelog.includes("## [Unreleased]")) {
    errors.push("CHANGELOG.md must not contain a permanent Unreleased section");
  }

  const versions = new Set();
  let previousDate = "9999-12-31";
  for (const release of releases) {
    if (!semver.test(release.version)) errors.push(`invalid semantic version: ${release.version}`);
    if (!isoDate.test(release.releasedAt) || Number.isNaN(Date.parse(release.releasedAt))) {
      errors.push(`invalid release date for ${release.version}: ${release.releasedAt}`);
    }
    if (versions.has(release.version)) errors.push(`duplicate release version: ${release.version}`);
    versions.add(release.version);
    if (release.releasedAt > previousDate) errors.push("public releases must be ordered newest first");
    previousDate = release.releasedAt;

    const expectedUrl = `https://github.com/Y4NN777/wisemoney/releases/tag/v${release.version}`;
    if (release.githubUrl !== expectedUrl) errors.push(`unexpected GitHub release URL for ${release.version}`);

    const frenchIds = release.content?.fr?.highlights?.map(({ id }) => id) ?? [];
    const englishIds = release.content?.en?.highlights?.map(({ id }) => id) ?? [];
    if (JSON.stringify(frenchIds) !== JSON.stringify(englishIds) || frenchIds.length === 0) {
      errors.push(`French and English highlights differ for ${release.version}`);
    }
  }
}

if (errors.length > 0) {
  console.error("Release consistency check failed:");
  for (const error of errors) console.error(`- ${error}`);
  process.exitCode = 1;
} else {
  console.log(`Release metadata is consistent for WiseMoney v${rootPackage.version}.`);
}
