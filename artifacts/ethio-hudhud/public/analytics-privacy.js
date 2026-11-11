/* Privacy bootstrap, not a tracker. Run before deferred analytics/app scripts. */
(function () {
  var preferenceKey = 'hudhud.analytics';
  var trackerKey = 'umami.disabled';
  var ownedOptOut = 'hudhud:privacy';
  var failed = false;

  function getState() {
    try {
      var nav = window.navigator;
      var dnt = nav.doNotTrack || window.doNotTrack || nav.msDoNotTrack;
      var browserBlocked = dnt === '1' || dnt === 1 || dnt === 'yes' ||
        nav.globalPrivacyControl === true;
      var storage = window.localStorage;
      var explicitOptIn = storage.getItem(preferenceKey) === 'on';
      var trackerValue = storage.getItem(trackerKey);
      var externalOptOut = !!trackerValue && trackerValue !== ownedOptOut;
      if ((!explicitOptIn || failed) && !trackerValue) {
        storage.setItem(trackerKey, ownedOptOut);
      } else if (explicitOptIn && !failed && trackerValue === ownedOptOut) {
        // Never remove an opt-out set by a visitor, extension, or another tool.
        storage.removeItem(trackerKey);
      }
      return {
        enabled: explicitOptIn && !externalOptOut && !failed,
        reason: failed ? 'storage' : externalOptOut ? 'tracker' :
          !explicitOptIn && browserBlocked ? 'browser' :
            !explicitOptIn ? 'preference' : null,
      };
    } catch (_) {
      return { enabled: false, reason: 'storage' };
    }
  }

  function notify() {
    getState();
    window.dispatchEvent(new Event('hudhud:analytics-change'));
  }

  window.hudhudAnalyticsPrivacy = {
    getState: getState,
    setEnabled: function (enabled) {
      try {
        window.localStorage.setItem(preferenceKey, enabled ? 'on' : 'off');
        failed = false;
        if (getState().reason === 'storage') throw new Error('Storage unavailable');
        notify();
        return true;
      } catch (_) {
        failed = true;
        // Best effort: keep automatic pageviews off even if preference writes fail.
        try {
          if (!window.localStorage.getItem(trackerKey)) {
            window.localStorage.setItem(trackerKey, ownedOptOut);
          }
        } catch (_) {}
        notify();
        return false;
      }
    },
  };
  getState();
  window.addEventListener('storage', function (event) {
    if (!event.key || event.key === preferenceKey || event.key === trackerKey) notify();
  });
  window.addEventListener('pageshow', notify);
  window.addEventListener('focus', notify);
})();
