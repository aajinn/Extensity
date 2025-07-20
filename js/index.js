document.addEventListener("DOMContentLoaded", function () {

  var SearchViewModel = function () {
    var self = this;
    self.q = ko.observable("");

    // TODO: Add more search control here.
  };

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
    self.search = new SearchViewModel();
    self.activeProfile = ko.observable().extend({ persistable: "activeProfile" });

    // View mode state and toggle
    self.viewMode = ko.observable(localStorage.getItem('viewMode') || 'list');
    self.toggleView = function () {
      var newMode = self.viewMode() === 'list' ? 'grid' : 'list';
      self.viewMode(newMode);
      localStorage.setItem('viewMode', newMode);
    };
    self.viewIcon = ko.pureComputed(function () {
      return self.viewMode() === 'list' ? 'fa-th' : 'fa-list';
    });

    var filterFn = function (i) {
      // Filtering function for search box
      if (!self.opts.searchBox()) return true;
      if (!self.search.q()) return true;
      return i.name().toUpperCase().indexOf(self.search.q().toUpperCase()) !== -1;
    };

    var filterProfileFn = function (i) {
      if (!i.reserved()) return true;
      return self.opts.showReserved() && i.hasItems();
    }

    var filterFavoriteFn = function (i) {
      return (self.profiles.favorites().contains(i));
    }

    var nameSortFn = function (i) {
      return i.name().toUpperCase();
    };

    var statusSortFn = function (i) {
      return self.opts.enabledFirst() && !i.status();
    };

    self.openChromeExtensions = function () {
      openTab("chrome://extensions");
    };

    self.launchApp = function (app) {
      chrome.management.launchApp(app.id());
    };

    self.launchOptions = function (ext) {
      chrome.tabs.create({ url: ext.optionsUrl(), active: true });
    };

    self.listedExtensions = ko.computed(function () {
      // Sorted/Filtered list of extensions
      return _(self.exts.extensions()).chain()
        .filter(filterFn)
        .sortBy(nameSortFn)
        .sortBy(statusSortFn)
        .value()
    }).extend({ countable: null });

    self.listedApps = ko.computed(function () {
      // Sorted/Filtered list of apps
      return _(self.exts.apps())
        .filter(filterFn);
    }).extend({ countable: null });

    self.listedItems = ko.computed(function () {
      // Sorted/Filtered list of all items
      return _(self.exts.items())
        .filter(filterFn);
    }).extend({ countable: null });

    self.listedProfiles = ko.computed(function () {
      return _(self.profiles.items())
        .filter(filterProfileFn);
    }).extend({ countable: null });

    self.listedFavorites = ko.computed(function () {
      return _(self.exts.extensions()).chain()
        .filter(filterFavoriteFn)
        .filter(filterFn)
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
  });

  // Workaround for Chrome bug https://bugs.chromium.org/p/chromium/issues/detail?id=307912
  window.setTimeout(function () { document.getElementById('workaround-307912').style.display = 'block'; }, 0);

  // Light/Dark mode toggle logic
  const html = document.documentElement;
  const btn = document.getElementById('theme-toggle');
  const icon = document.getElementById('theme-icon');
  function setTheme(mode) {
    if (mode === 'dark') {
      html.setAttribute('data-theme', 'dark');
      icon.classList.remove('fa-moon-o');
      icon.classList.add('fa-sun-o');
    } else {
      html.setAttribute('data-theme', 'light');
      icon.classList.remove('fa-sun-o');
      icon.classList.add('fa-moon-o');
    }
    localStorage.setItem('theme', mode);
  }
  function toggleTheme() {
    const current = html.getAttribute('data-theme') || (window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light');
    setTheme(current === 'dark' ? 'light' : 'dark');
  }
  if (btn && icon) {
    btn.addEventListener('click', function (e) {
      e.preventDefault();
      toggleTheme();
    });
    // On load, set theme from localStorage or default to light
    const saved = localStorage.getItem('theme');
    if (saved) {
      setTheme(saved);
    } else {
      setTheme('light');
    }
  }
});
