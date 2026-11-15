// -----------------------------------------------------------------------------
// Registers every SDK handler on a GladysIntegration (or the SDK's fake
// Gladys) and returns the hub, so index.js stays a few lines and the tests
// drive the very same wiring.
// -----------------------------------------------------------------------------

import { createLogger } from '@gladysassistant/integration-sdk';
import { normalizeConfig } from './config.js';
import { Hub, WIDGET_KEY } from './hub.js';
import { MESSAGES } from './i18n.js';
import { SCENE_ACTIONS } from './scenes.js';
import { Store } from './store.js';
import { WIDGETS } from './widgets.js';

const logger = createLogger({ name: 'xmltv-app' });

/**
 * @param {object} gladys GladysIntegration instance
 * @param {object} [options] test seams: store, timers, now, fetchImpl
 */
export function registerHandlers(gladys, options = {}) {
  const hub = new Hub({
    gladys,
    store: options.store ?? new Store(),
    timers: options.timers ?? true,
    now: options.now,
    fetchImpl: options.fetchImpl,
  });

  // Resolved once the hub has started; every handler waits for it.
  let resolveReady;
  const ready = new Promise((resolve) => {
    resolveReady = resolve;
  });
  let started = false;
  const whenReady =
    (fn) =>
    async (...args) => {
      await ready;
      return fn(...args);
    };

  gladys.on('connected', async () => {
    try {
      if (started) {
        // A reconnection (Gladys restarted): re-sync what Gladys may have lost.
        await hub.resync();
        return;
      }
      started = true;
      await hub.start(normalizeConfig(await gladys.getConfig()));
    } catch (err) {
      logger.error('Initialization failed', err);
      await gladys.setConnectionStatus(false, MESSAGES.initFailed).catch(() => {});
    } finally {
      resolveReady();
    }
  });

  gladys.onScanRequest(whenReady(() => hub.publishDevices()));

  // Gladys drops the states of a feature not added yet: once the user adds a
  // channel (or updates it), everything is sent again.
  gladys.onDeviceCreated(whenReady((device) => hub.onDeviceCreated(device)));
  gladys.onDeviceUpdated(whenReady((device) => hub.onDeviceCreated(device)));
  // The widget shows the names given in Gladys.
  gladys.onDeviceDeleted(whenReady(() => gladys.requestWidgetRefresh(WIDGET_KEY)));

  gladys.onConfigUpdated(
    whenReady(async (newConfig) => {
      logger.info('Configuration updated');
      await hub.start(normalizeConfig(newConfig));
    }),
  );

  gladys.onAction(
    'test_guide',
    whenReady(async () => {
      logger.info('Action: test the guide');
      return hub.test();
    }),
  );

  gladys.onAction(
    'list_channels',
    whenReady(async (fields = {}) => {
      logger.info('Action: list the channels');
      return hub.listChannels(fields.filter);
    }),
  );

  for (const [key, handler] of Object.entries(SCENE_ACTIONS)) {
    gladys.onSceneAction(
      key,
      whenReady((fields) => handler(hub, { fields })),
    );
  }

  for (const [key, widget] of Object.entries(WIDGETS)) {
    gladys.onWidgetGet(
      key,
      whenReady((request) => widget.get(hub, request)),
    );
  }

  return {
    hub,
    ready,
    stop: () => hub.stop(),
  };
}
