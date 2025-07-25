ko.extenders.pluckable = function (target, option) {
  // Pluck an iterable by an observable field
  target.pluck = ko.computed(function () {
    return _(target()).map(function (i) { return i[option](); });
  });
};

ko.extenders.toggleable = function (target, option) {
  // Toggles for extension collections
  target.toggle = function (filterFn) {
    _(target()).chain().filter(filterFn).each(function (i) { i.toggle(); });
  };
  target.enable = function (filterFn) {
    _(target()).chain().filter(filterFn).each(function (i) { i.enable(); });
  };
  target.disable = function (filterFn) {
    _(target()).chain().filter(filterFn).each(function (i) { i.disable(); });
  };
};

ko.extenders.persistable = function (target, key) {
  // Persists a single observable (or observableArray) in cloud browser storage
  chrome.storage.sync.get(key, function (v) {

    // Set initial value from storage if present.
    if (v[key]) {
      target(v[key]);
    }

    // Subscribe to changes after initializing the value.
    target.subscribe(function (val) {
      var obj = {};
      obj[key] = val;
      chrome.storage.sync.set(obj);
    });
  });
};

ko.extenders.countable = function (target, option) {
  target.count = ko.computed(function () {
    return target().length;
  });

  target.any = ko.computed(function () {
    return target().length > 0;
  });

  target.many = ko.computed(function () {
    return target().length > 1;
  });

  target.none = ko.computed(function () {
    return target().length == 0;
  });
};

var fadeOutMessage = function (id) {
  el = document.getElementById(id);
  el.className = "visible";
  _.delay(function () { el.className = "fadeout" }, 2000);
};

var DismissalsCollection = function () {
  var self = this;

  self.dismissals = ko.observableArray();

  self.dismiss = function (id) {
    self.dismissals.push(id);
  };

  self.dismissed = function (id) {
    return (self.dismissals.indexOf(id) !== -1)
  };

  // Initializer
  chrome.storage.sync.get("dismissals", function (arr) {
    self.dismissals(arr);
    // Subscribe to observables after setting the initial value so we don't re-save the same thing.
    self.dismissals.subscribe(function (a) {
      chrome.storage.sync.set({ dismissals: a });
    });
  });
};

var OptionsCollection = function () {
  var self = this;

  // Options and defauts
  var defs = {
    showHeader: true,
    groupApps: true,
    appsFirst: false,
    enabledFirst: false,
    searchBox: true,
    showOptions: true,
    keepAlwaysOn: false,
    showReserved: false
  };

  // Define observables.
  _(defs).each(function (def, key) {
    self[key] = ko.observable(def);
  });

  // Save values from all observables.
  self.save = function (callback) {
    chrome.storage.sync.set(
      _(defs).mapObject(function (val, key) { return self[key](); }), callback
    );
  };

  // Set observable values from Chrome Storage
  chrome.storage.sync.get(_(defs).keys(), function (v) {
    _(v).each(function (val, key) {
      self[key](val);
    });
  });

};

var ProfileModel = function (name, items) {
  var self = this;

  var reserved_names = {
    "__always_on": "Always On",
    "__favorites": "Favorites"
  };

  var icons = {
    "__default": "fa-user-circle-o",
    "__always_on": "fa-lightbulb-o",
    "__favorites": "fa-star"
  }

  self.name = ko.observable(name);
  self.items = ko.observableArray(items);

  self.reserved = ko.computed(function () {
    return self.name().startsWith("__");
  });

  self.hasItems = ko.computed(function () {
    return self.items().length > 0;
  });

  self.short_name = ko.pureComputed(function () {
    return reserved_names[self.name()] || _.str.prune(self.name(), 30);
  });

  self.icon = ko.pureComputed(function () {
    // console.log(icons["__default"]);
    // return icons["__default"];
    // console.log(icons[self.name()] || icons['__default']);
    return (icons[self.name()] || icons['__default']);
  });

  self.contains = function (i) {
    // Check if a given item is present in the profile list.
    return _.contains(self.items(), i.id());
  };

  return this;
};

var ProfileCollectionModel = function () {
  var self = this;

  self.items = ko.observableArray();
  self.localProfiles = ko.observable(undefined).extend({ persistable: "localProfiles" });

  self.any = ko.computed(function () {
    return self.items().length > 0;
  });

  self.add = function (name, items) {
    items = items || [];
    return self.items.push(new ProfileModel(name, items));
  }

  self.find = function (name) {
    return _(self.items()).find(function (i) { return i.name() == name });
  }

  self.find_or_create = function (name) {
    return self.find(name) || (new ProfileModel(name, []));
  };

  self.always_on = function () {
    return self.find_or_create("__always_on");
  };

  self.favorites = function () {
    return self.find_or_create("__favorites");
  };

  self.remove = function (profile) {
    self.items.remove(profile);
  }

  self.exists = function (name) {
    return !_(self.find(name)).isUndefined();
  }

  self.save = function (callback) {
    var r = {};

    _(self.items()).each(function (i) {
      if (i.name()) {
        r[i.name()] = _(i.items()).uniq();
      }
    });

    // Try sync storage first. If it fails, store the Profiles locally.
    chrome.storage.sync.set({ profiles: r }, function (val) {
      if (chrome.runtime.lastError) {
        self.localProfiles(true);
        chrome.storage.local.set({ profiles: r }, callback);
      }
      else {
        self.localProfiles(false);
        callback(val);
      }
    });

  };

  chrome.storage.sync.get("localProfiles", function (v) {
    // Pull profiles from sync or local storage as appropriate.
    var storage = (v.localProfiles) ? chrome.storage.local : chrome.storage.sync;

    var sortFn = function (el) {
      // Add heading space to reserved profiles to sort at top.
      return (el.startsWith("__") ? " " : "") + el.toUpperCase();
    };

    storage.get("profiles", function (p) {
      p = p['profiles'] || {};
      var k = _(p).chain().keys().sortBy(sortFn).value();
      _(k).each(function (name) {
        self.items.push(new ProfileModel(name, p[name]));
      });
    });

  })

  return this;
}

var ExtensionModel = function (e) {
  var self = this;

  var item = e;

  // Get the largest available icon.
  var largestIcon = function (icons) {
    var theme = (localStorage.getItem('theme')) || document.documentElement.getAttribute('data-theme') || 'light';
    var defaultIcon = theme === 'dark' ? 'images/default-dark.png' : 'images/default.png';
    if (!icons || !icons.length) return defaultIcon;
    var largest = _(icons).chain().pluck('size').max().value();
    var icon = _(icons).find({ size: largest });
    return (icon && icon.url) || defaultIcon;
  };

  self.id = ko.observable(item.id);
  self.name = ko.observable(item.name);
  self.type = item.type;
  self.mayDisable = item.mayDisable;
  self.isApp = ko.observable(item.isApp);
  self.icon = largestIcon(item.icons);
  self.status = ko.observable(item.enabled);
  self.optionsUrl = ko.observable(item.optionsUrl);
  self.installType = ko.observable(item.installType);

  self.disabled = ko.pureComputed(function () {
    return !self.status();
  });

  self.is_development = ko.pureComputed(function () {
    return self.installType() == 'development';
  });

  self.short_name = ko.computed(function () {
    return _.str.prune(self.name(), 40);
  })

  self.toggle = function () {
    self.status(!self.status());
  };

  self.enable = function () {
    self.status(true);
  };

  self.disable = function () {
    self.status(false);
  }

  self.status.subscribe(function (value) {
    chrome.management.setEnabled(self.id(), value);
  });

};

var ExtensionCollectionModel = function () {
  var self = this;

  self.items = ko.observableArray();

  var typeFilter = function (types) {
    var all = self.items(); res = [];
    for (var i = 0; i < all.length; i++) {
      if (_(types).includes(all[i].type)) { res.push(all[i]); }
    }
    return res;
  };

  self.extensions = ko.computed(function () {
    return _(typeFilter(['extension'])).filter(function (i) { return i.mayDisable });
  }).extend({ pluckable: 'id', toggleable: null });

  self.apps = ko.computed(function () {
    return typeFilter(["hosted_app", "packaged_app", "legacy_packaged_app"]);
  }).extend({ pluckable: 'id', toggleable: null });

  // Enabled extensions
  self.enabled = ko.pureComputed(function () {
    return _(self.extensions()).filter(function (i) { return i.status(); });
  }).extend({ pluckable: 'id', toggleable: null });

  // Disabled extensions
  self.disabled = ko.pureComputed(function () {
    return _(self.extensions()).filter(function (i) { return !i.status(); });
  }).extend({ pluckable: 'id', toggleable: null });

  // Find a single extension model by ud
  self.find = function (id) {
    return _(self.items()).find(function (i) { return i.id() == id });
  };

  // Initialize
  chrome.management.getAll(function (results) {
    _(results).chain()
      .sortBy(function (i) { return i.name.toUpperCase(); })
      .each(function (i) {
        if (i.name != "Extension Manager" && i.type != 'theme') {
          self.items.push(new ExtensionModel(i));
        }
      });
  });

};