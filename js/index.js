document.addEventListener("DOMContentLoaded", function () {



  var SwitchViewModel = function (exts, profiles, opts) {
    var self = this;

    var init = [];

    self.exts = exts;
    self.profiles = profiles;
    self.opts = opts;
    self.toggled = ko.observableArray().extend({ persistable: "toggled" });

    self.any = ko.computed(function () {
      return self.toggled().length > 0;
    });

    self.toggleStyle = ko.pureComputed(function () {
      return (self.any()) ? 'fa-toggle-off' : 'fa-toggle-on'
    });

    var disableFilterFn = function (item) {
      // Filter out Always On extensions when disabling, if option is set.
      if (!self.opts.keepAlwaysOn()) return true;
      return !_(self.profiles.always_on().items()).contains(item.id());
    };

    self.flip = function () {
      if (self.any()) {
        // Re-enable
        _(self.toggled()).each(function (id) {
          // Old disabled extensions may be removed
          try { self.exts.find(id).enable(); } catch (e) { };
        });
        self.toggled([]);
      } else {
        // Disable
        self.toggled(self.exts.enabled.pluck());
        self.exts.enabled.disable(disableFilterFn);
      };
    };

  };

  var ExtensionManagerViewModel = function () {
    var self = this;

    self.profiles = new ProfileCollectionModel();
    self.exts = new ExtensionCollectionModel();
    self.opts = new OptionsCollection();
    self.dismissals = new DismissalsCollection();
    self.switch = new SwitchViewModel(self.exts, self.profiles, self.opts);
    self.activeProfile = ko.observable().extend({ persistable: "activeProfile" });

    // Only horizontal view mode
    self.viewMode = ko.observable('horizontal');

    var filterProfileFn = function (i) {
      if (!i.reserved()) return true;
      return self.opts.showReserved() && i.hasItems();
    }

    var filterFavoriteFn = function (i) {
      return (self.profiles.favorites().contains(i));
    }

    // Usage tracking
    self.usageStats = ko.observable({});
    
    // Load usage stats from storage
    chrome.storage.local.get('extensionUsage', function(result) {
      self.usageStats(result.extensionUsage || {});
    });
    
    // Track extension usage
    self.trackUsage = function(extensionId) {
      var stats = self.usageStats();
      stats[extensionId] = (stats[extensionId] || 0) + 1;
      self.usageStats(stats);
      chrome.storage.local.set({'extensionUsage': stats});
    };

    var nameSortFn = function (i) {
      return i.name().toUpperCase();
    };

    var statusSortFn = function (i) {
      return self.opts.enabledFirst() && !i.status();
    };
    
    var usageSortFn = function (i) {
      var stats = self.usageStats();
      return -(stats[i.id()] || 0); // Negative for descending order (most used first)
    };

    self.openChromeExtensions = function () {
      openTab("chrome://extensions");
    };

    self.launchApp = function (app) {
      chrome.management.launchApp(app.id());
      self.trackUsage(app.id());
    };

    self.launchOptions = function (ext) {
      chrome.tabs.create({ url: ext.optionsUrl(), active: true });
      self.trackUsage(ext.id());
    };

    self.listedExtensions = ko.computed(function () {
      // Sorted list of extensions
      return _(self.exts.extensions()).chain()
        .sortBy(nameSortFn)
        .sortBy(statusSortFn)
        .value()
    }).extend({ countable: null });

    self.listedApps = ko.computed(function () {
      // List of apps
      return self.exts.apps();
    }).extend({ countable: null });

    self.listedItems = ko.computed(function () {
      // List of all items sorted by usage (trigger on usageStats change)
      var stats = self.usageStats();
      return _(self.exts.items()).chain()
        .sortBy(nameSortFn)
        .sortBy(statusSortFn)
        .sortBy(function(i) {
          return -(stats[i.id()] || 0); // Most used first
        })
        .value();
    }).extend({ countable: null });

    self.listedProfiles = ko.computed(function () {
      return _(self.profiles.items())
        .filter(filterProfileFn);
    }).extend({ countable: null });

    self.listedFavorites = ko.computed(function () {
      return _(self.exts.extensions()).chain()
        .filter(filterFavoriteFn)
        .sortBy(nameSortFn)
        .sortBy(statusSortFn)
        .value();
    }).extend({ countable: null });

    self.emptyItems = ko.pureComputed(function () {
      return self.listedApps.none() && self.listedExtensions.none();
    });

    self.setProfile = function (p) {
      self.activeProfile(p.name());
      // Profile items, plus always-on items
      var ids = _.union(p.items(), self.profiles.always_on().items());
      var to_enable = _.intersection(self.exts.disabled.pluck(), ids);
      var to_disable = _.difference(self.exts.enabled.pluck(), ids);
      _(to_enable).each(function (id) { self.exts.find(id).enable() });
      _(to_disable).each(function (id) { self.exts.find(id).disable() });
    };

    self.unsetProfile = function () {
      self.activeProfile(undefined);
    };

    self.toggleExtension = function (e) {
      e.toggle();
      self.trackUsage(e.id());
      self.unsetProfile();
    }

    // Private helper functions
    var openTab = function (url) {
      chrome.tabs.create({ url: url });
      close();
    };

    var close = function () {
      window.close();
    };

    // View helpers
    var visitedProfiles = ko.computed(function () {
      return (self.dismissals.dismissed("profile_page_viewed") || self.profiles.any());
    });

  };

  _.defer(function () {
    vm = new ExtensionManagerViewModel();
    ko.bindingProvider.instance = new ko.secureBindingsProvider({});
    ko.applyBindings(vm, document.body);
    // Expose for debugging
    window.vm = vm;

    // Add horizontal scroll on mouse wheel
    const horizontalList = document.querySelector('.horizontal-list');
    if (horizontalList) {
      horizontalList.addEventListener('wheel', function (e) {
        e.preventDefault();
        horizontalList.scrollLeft += e.deltaY;
      });
    }
  });




});
