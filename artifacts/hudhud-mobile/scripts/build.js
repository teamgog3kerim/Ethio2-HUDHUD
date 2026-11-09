const fs = require('fs');
const path = require('path');
const { spawn } = require('child_process');
const { Readable } = require('stream');
const { pipeline } = require('stream/promises');

let metroProcess = null;
let stoppingMetro = false;
let metroStopPromise = null;

const projectRoot = path.resolve(__dirname, '..');

function findWorkspaceRoot(startDir) {
  let dir = startDir;
  while (dir !== path.dirname(dir)) {
    if (fs.existsSync(path.join(dir, 'pnpm-workspace.yaml'))) {
      return dir;
    }
    dir = path.dirname(dir);
  }
  throw new Error(
    'Could not find workspace root (no pnpm-workspace.yaml found)',
  );
}

const workspaceRoot = findWorkspaceRoot(projectRoot);
const basePath = (process.env.BASE_PATH || '/').replace(/\/+$/, '');
const metroPort = Number(process.env.EXPO_BUILD_METRO_PORT || 8081);
if (!Number.isInteger(metroPort) || metroPort < 1 || metroPort > 65535) {
  throw new Error('EXPO_BUILD_METRO_PORT must be a valid port number');
}
const metroOrigin = `http://localhost:${metroPort}`;

async function stopMetro() {
  if (metroStopPromise) return metroStopPromise;
  if (!metroProcess) return;
  stoppingMetro = true;
  const child = metroProcess;
  metroStopPromise = (async () => {
    const exited = new Promise((resolve) => {
      if (child.exitCode !== null || child.signalCode !== null) resolve();
      else child.once('exit', resolve);
    });
    const terminate = (signal) => {
      try {
        // pnpm launches Expo as a child. Stop the owned group, not just pnpm,
        // so a previous platform cannot retain its heap or listening port.
        if (process.platform === 'win32') child.kill(signal);
        else if (child.pid) process.kill(-child.pid, signal);
      } catch (error) {
        if (error.code !== 'ESRCH') throw error;
      }
    };
    terminate('SIGTERM');
    let timeout;
    await Promise.race([
      exited,
      new Promise((resolve) => {
        timeout = setTimeout(() => {
          terminate('SIGKILL');
          resolve();
        }, 5000);
      }),
    ]);
    clearTimeout(timeout);
    // The launcher may exit before a stubborn descendant does.
    terminate('SIGKILL');
    metroProcess = null;
  })();
  return metroStopPromise;
}

async function exitWithError(message) {
  console.error(message);
  await stopMetro();
  process.exit(1);
}

function setupSignalHandlers() {
  const cleanup = async () => {
    console.log('Cleaning up Metro process...');
    await stopMetro();
    // An interrupted deployment must not be reported as a successful build.
    process.exit(1);
  };

  process.on('SIGINT', cleanup);
  process.on('SIGTERM', cleanup);
  process.on('SIGHUP', cleanup);
}

function stripProtocol(domain) {
  let urlString = domain.trim();

  if (!/^https?:\/\//i.test(urlString)) {
    urlString = `https://${urlString}`;
  }

  return new URL(urlString).host;
}

function getDeploymentDomain() {
  if (process.env.REPLIT_INTERNAL_APP_DOMAIN) {
    return stripProtocol(process.env.REPLIT_INTERNAL_APP_DOMAIN);
  }

  if (process.env.REPLIT_DEV_DOMAIN) {
    return stripProtocol(process.env.REPLIT_DEV_DOMAIN);
  }

  if (process.env.EXPO_PUBLIC_DOMAIN) {
    return stripProtocol(process.env.EXPO_PUBLIC_DOMAIN);
  }

  console.error(
    'ERROR: No deployment domain found. Set REPLIT_INTERNAL_APP_DOMAIN, REPLIT_DEV_DOMAIN, or EXPO_PUBLIC_DOMAIN',
  );
  process.exit(1);
}

function prepareDirectories(timestamp) {
  console.log('Preparing build directories...');

  const staticBuild = path.join(projectRoot, 'static-build');
  if (fs.existsSync(staticBuild)) {
    fs.rmSync(staticBuild, { recursive: true });
  }

  const dirs = [
    path.join(staticBuild, timestamp, '_expo', 'static', 'js', 'ios'),
    path.join(staticBuild, timestamp, '_expo', 'static', 'js', 'android'),
    path.join(staticBuild, 'ios'),
    path.join(staticBuild, 'android'),
  ];

  for (const dir of dirs) {
    fs.mkdirSync(dir, { recursive: true });
  }

  console.log('Build:', timestamp);
}

function clearMetroCache() {
  console.log('Clearing Metro cache...');

  const cacheDirs = [
    path.join(projectRoot, '.metro-cache'),
    path.join(projectRoot, 'node_modules/.cache/metro'),
  ];

  for (const dir of cacheDirs) {
    if (fs.existsSync(dir)) {
      fs.rmSync(dir, { recursive: true, force: true });
    }
  }

  console.log('Cache cleared');
}

async function checkMetroHealth() {
  try {
    const response = await fetch(`${metroOrigin}/status`, {
      signal: AbortSignal.timeout(5000),
    });
    return response.ok && (await response.text()).trim() === 'packager-status:running';
  } catch {
    return false;
  }
}

function getExpoPublicReplId() {
  return process.env.REPL_ID || process.env.EXPO_PUBLIC_REPL_ID;
}

async function startMetro(expoPublicDomain, expoPublicReplId) {
  const isRunning = await checkMetroHealth();
  if (isRunning) {
    throw new Error(`Metro port ${metroPort} is already in use; choose a dedicated EXPO_BUILD_METRO_PORT`);
  }

  stoppingMetro = false;
  metroStopPromise = null;
  console.log('Starting Metro...');
  console.log(`Setting EXPO_PUBLIC_DOMAIN=${expoPublicDomain}`);
  const env = {
    ...process.env,
    // Production build containers have less memory than the workspace.
    // A single transformer and bounded heap leave room for the build runner.
    CI: '1',
    NODE_OPTIONS: `${process.env.NODE_OPTIONS || ''} --max-old-space-size=1536`.trim(),
    EXPO_PUBLIC_DOMAIN: expoPublicDomain,
    EXPO_PUBLIC_REPL_ID: expoPublicReplId,
  };

  if (expoPublicReplId) {
    console.log(`Setting EXPO_PUBLIC_REPL_ID=${expoPublicReplId}`);
  }

  metroProcess = spawn(
    'pnpm',
    ['exec', 'expo', 'start', '--no-dev', '--minify', '--localhost', '--port', String(metroPort), '--max-workers', '1'],
    {
      stdio: ['ignore', 'pipe', 'pipe'],
      detached: process.platform !== 'win32',
      cwd: projectRoot,
      env,
    },
  );

  const child = metroProcess;
  child.once('error', (error) => {
    void exitWithError(`Metro could not start: ${error.message}`);
  });
  child.once('exit', (code, signal) => {
    if (!stoppingMetro && metroProcess === child) {
      void exitWithError(
        `Metro exited unexpectedly (code=${code}, signal=${signal || 'none'}). ` +
        'Check the build memory limit and the Metro error output above.',
      );
    }
  });
  if (metroProcess.stdout) {
    metroProcess.stdout.on('data', (data) => {
      const output = data.toString().trim();
      if (output) console.log(`[Metro] ${output}`);
    });
  }
  if (metroProcess.stderr) {
    metroProcess.stderr.on('data', (data) => {
      const output = data.toString().trim();
      if (output) console.error(`[Metro Error] ${output}`);
    });
  }

  for (let i = 0; i < 60; i++) {
    await new Promise((resolve) => setTimeout(resolve, 1000));

    const healthy = await checkMetroHealth();
    if (healthy) {
      console.log('Metro ready');
      return;
    }
  }

  console.error('Metro timeout');
  await exitWithError('Metro did not become healthy within 60 seconds');
}

async function downloadFile(url, outputPath) {
  const controller = new AbortController();
  const fiveMinMS = 5 * 60 * 1_000;
  const timeoutId = setTimeout(() => controller.abort(), fiveMinMS);

  try {
    console.log(`Downloading: ${url}`);
    const response = await fetch(url, { signal: controller.signal });

    if (!response.ok) {
      throw new Error(`HTTP ${response.status}`);
    }

    const file = fs.createWriteStream(outputPath);
    await pipeline(Readable.fromWeb(response.body), file);

    const fileSize = fs.statSync(outputPath).size;

    if (fileSize === 0) {
      fs.unlinkSync(outputPath);
      throw new Error('Downloaded file is empty');
    }
  } catch (error) {
    if (fs.existsSync(outputPath)) {
      fs.unlinkSync(outputPath);
    }

    if (error.name === 'AbortError') {
      throw new Error(`Download timeout after 5m: ${url}`);
    }
    throw error;
  } finally {
    clearTimeout(timeoutId);
  }
}

async function downloadBundle(platform, timestamp) {
  const entryPath = path.resolve(
    projectRoot,
    'node_modules',
    'expo-router',
    'entry',
  );
  const bundlePath = path.relative(workspaceRoot, entryPath);
  const url = new URL(`${metroOrigin}/${bundlePath}.bundle`);
  url.searchParams.set('platform', platform);
  url.searchParams.set('dev', 'false');
  url.searchParams.set('hot', 'false');
  url.searchParams.set('lazy', 'false');
  url.searchParams.set('minify', 'true');

  const output = path.join(
    'static-build',
    timestamp,
    '_expo',
    'static',
    'js',
    platform,
    'bundle.js',
  );

  console.log(`Fetching ${platform} bundle...`);
  await downloadFile(url.toString(), output);
  console.log(`${platform} bundle ready`);
}

async function downloadManifest(platform) {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), 300_000);

  try {
    console.log(`Fetching ${platform} manifest...`);
    const response = await fetch(`${metroOrigin}/manifest`, {
      headers: { 'expo-platform': platform },
      signal: controller.signal,
    });

    if (!response.ok) {
      throw new Error(`HTTP ${response.status}`);
    }

    const manifest = await response.json();
    console.log(`${platform} manifest ready`);
    return manifest;
  } catch (error) {
    if (error.name === 'AbortError') {
      throw new Error(
        `Manifest download timeout after 5m for platform: ${platform}`,
      );
    }
    throw error;
  } finally {
    clearTimeout(timeoutId);
  }
}

async function downloadBundlesAndManifests(timestamp, domain, replId) {
  console.log('Downloading bundles and manifests...');
  console.log('This may take several minutes for production builds...');

  try {
    const manifests = {};
    for (const platform of ['ios', 'android']) {
      await startMetro(domain, replId);
      await downloadBundle(platform, timestamp);
      manifests[platform] = await downloadManifest(platform);
      if (platform === 'ios') {
        console.log('Releasing iOS Metro memory before building Android...');
        await stopMetro();
      }
    }

    console.log('All downloads completed successfully');
    return manifests;
  } catch (error) {
    await exitWithError(`Download failed: ${error.message}`);
  }
}

function extractAssets(timestamp) {
  const staticBuild = path.join(projectRoot, 'static-build');
  const bundles = {
    ios: fs.readFileSync(
      path.join(
        staticBuild,
        timestamp,
        '_expo',
        'static',
        'js',
        'ios',
        'bundle.js',
      ),
      'utf-8',
    ),
    android: fs.readFileSync(
      path.join(
        staticBuild,
        timestamp,
        '_expo',
        'static',
        'js',
        'android',
        'bundle.js',
      ),
      'utf-8',
    ),
  };

  const assetsMap = new Map();
  const assetPattern =
    /httpServerLocation:"([^"]+)"[^}]*hash:"([^"]+)"[^}]*name:"([^"]+)"[^}]*type:"([^"]+)"/g;

  const extractFromBundle = (bundle, platform) => {
    for (const match of bundle.matchAll(assetPattern)) {
      const originalPath = match[1];
      const filename = match[3] + '.' + match[4];

      const tempUrl = new URL(`${metroOrigin}${originalPath}`);
      const unstablePath = tempUrl.searchParams.get('unstable_path');

      if (!unstablePath) {
        throw new Error(`Asset missing unstable_path: ${originalPath}`);
      }

      const decodedPath = decodeURIComponent(unstablePath);
      const key = path.posix.join(decodedPath, filename);

      if (!assetsMap.has(key)) {
        const asset = {
          url: path.posix.join('/', decodedPath, filename),
          originalPath: originalPath,
          filename: filename,
          relativePath: decodedPath,
          hash: match[2],
          platforms: new Set(),
        };

        assetsMap.set(key, asset);
      }
      assetsMap.get(key).platforms.add(platform);
    }
  };

  extractFromBundle(bundles.ios, 'ios');
  extractFromBundle(bundles.android, 'android');

  return Array.from(assetsMap.values());
}

async function downloadAssets(assets, timestamp) {
  if (assets.length === 0) {
    return 0;
  }

  console.log('Copying assets...');
  let successCount = 0;
  const failures = [];

  const downloadPromises = assets.map(async (asset) => {
    const tempUrl = new URL(`${metroOrigin}${asset.originalPath}`);
    const unstablePath = tempUrl.searchParams.get('unstable_path');

    if (!unstablePath) {
      throw new Error(`Asset missing unstable_path: ${asset.originalPath}`);
    }

    const decodedPath = decodeURIComponent(unstablePath);

    const outputDir = path.join(
      projectRoot,
      'static-build',
      timestamp,
      '_expo',
      'static',
      'js',
      asset.relativePath,
    );
    fs.mkdirSync(outputDir, { recursive: true });
    const output = path.join(outputDir, asset.filename);

    try {
      const candidates = [
        path.join(projectRoot, decodedPath, asset.filename),
        path.join(workspaceRoot, decodedPath, asset.filename),
      ];
      const found = candidates.find((p) => fs.existsSync(p));
      if (!found) {
        throw new Error(`Asset not found on disk: ${asset.filename}`);
      }
      fs.copyFileSync(found, output);
      successCount++;
    } catch (error) {
      failures.push({
        filename: asset.filename,
        error: error.message,
        url: asset.originalPath,
      });
    }
  });

  await Promise.all(downloadPromises);

  if (failures.length > 0) {
    const errorMsg =
      `Failed to download ${failures.length} asset(s):\n` +
      failures
        .map((f) => `  - ${f.filename}: ${f.error} (${f.url})`)
        .join('\n');
    exitWithError(errorMsg);
  }

  console.log(`Copied ${successCount} assets`);
  return successCount;
}

function updateBundleUrls(timestamp, baseUrl) {
  const updateForPlatform = (platform) => {
    const bundlePath = path.join(
      projectRoot,
      'static-build',
      timestamp,
      '_expo',
      'static',
      'js',
      platform,
      'bundle.js',
    );
    let bundle = fs.readFileSync(bundlePath, 'utf-8');

    bundle = bundle.replace(
      /httpServerLocation:"(\/[^"]+)"/g,
      (_match, capturedPath) => {
        const tempUrl = new URL(`${metroOrigin}${capturedPath}`);
        const unstablePath = tempUrl.searchParams.get('unstable_path');

        if (!unstablePath) {
          throw new Error(
            `Asset missing unstable_path in bundle: ${capturedPath}`,
          );
        }

        const decodedPath = decodeURIComponent(unstablePath);
        return `httpServerLocation:"${baseUrl}${basePath}/${timestamp}/_expo/static/js/${decodedPath}"`;
      },
    );

    fs.writeFileSync(bundlePath, bundle);
  };

  updateForPlatform('ios');
  updateForPlatform('android');
  console.log('Updated bundle URLs');
}

function updateManifests(manifests, timestamp, baseUrl, assetsByHash) {
  const updateForPlatform = (platform, manifest) => {
    if (!manifest.launchAsset || !manifest.extra) {
      exitWithError(`Malformed manifest for ${platform}`);
    }

    manifest.launchAsset.url = `${baseUrl}${basePath}/${timestamp}/_expo/static/js/${platform}/bundle.js`;
    manifest.launchAsset.key = `bundle-${timestamp}`;
    manifest.createdAt = new Date(
      Number(timestamp.split('-')[0]),
    ).toISOString();
    manifest.extra.expoClient.hostUri =
      baseUrl.replace('https://', '') + '/' + platform;
    manifest.extra.expoGo.debuggerHost =
      baseUrl.replace('https://', '') + '/' + platform;
    manifest.extra.expoGo.packagerOpts.dev = false;

    if (manifest.assets && manifest.assets.length > 0) {
      manifest.assets.forEach((asset) => {
        if (!asset.url) return;

        const hash = asset.hash;
        if (!hash) return;

        const assetInfo = assetsByHash.get(hash);
        if (!assetInfo) return;

        asset.url = `${baseUrl}${basePath}/${timestamp}/_expo/static/js/${assetInfo.relativePath}/${assetInfo.filename}`;
      });
    }

    fs.writeFileSync(
      path.join(projectRoot, 'static-build', platform, 'manifest.json'),
      JSON.stringify(manifest, null, 2),
    );
  };

  updateForPlatform('ios', manifests.ios);
  updateForPlatform('android', manifests.android);
  console.log('Manifests updated');
}

async function main() {
  console.log('Building static Expo Go deployment...');

  setupSignalHandlers();

  const domain = getDeploymentDomain();
  const expoPublicReplId = getExpoPublicReplId();
  const baseUrl = `https://${domain}`;
  const timestamp = `${Date.now()}-${process.pid}`;

  prepareDirectories(timestamp);
  clearMetroCache();

  const downloadTimeout = 600000;
  const downloadPromise = downloadBundlesAndManifests(timestamp, domain, expoPublicReplId);
  const timeoutPromise = new Promise((_, reject) => {
    setTimeout(() => {
      reject(
        new Error(
          `Overall download timeout after ${downloadTimeout / 1000} seconds. ` +
            'Metro may be struggling to generate bundles. Check Metro logs above.',
        ),
      );
    }, downloadTimeout);
  });

  const manifests = await Promise.race([downloadPromise, timeoutPromise]);

  console.log('Processing assets...');
  const assets = extractAssets(timestamp);
  console.log('Found', assets.length, 'unique asset(s)');

  const assetsByHash = new Map();
  for (const asset of assets) {
    assetsByHash.set(asset.hash, {
      relativePath: asset.relativePath,
      filename: asset.filename,
    });
  }

  const assetCount = await downloadAssets(assets, timestamp);

  if (assetCount > 0) {
    updateBundleUrls(timestamp, baseUrl);
  }

  console.log('Updating manifests and creating landing page...');
  updateManifests(manifests, timestamp, baseUrl, assetsByHash);

  console.log('Build complete! Deploy to:', baseUrl);

  await stopMetro();
  process.exit(0);
}

main().catch(async (error) => {
  await exitWithError(`Build failed: ${error.message}`);
});
