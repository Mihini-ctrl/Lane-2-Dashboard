(function (root, factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  if (root) root.Lane2DraftStore = api;
})(typeof window !== 'undefined' ? window : globalThis, function () {
  'use strict';

  const PREFIX = 'lane2-assignment-drafts-';
  const key = (userId) => PREFIX + String(userId || '');
  const valid = (draft, userId) => draft && typeof draft === 'object' && typeof draft.id === 'string'
    && draft.owner === userId && draft.data && typeof draft.data === 'object';

  function load(storage, userId) {
    if (!storage || !userId) return [];
    try {
      const drafts = JSON.parse(storage.getItem(key(userId)) || '[]');
      return Array.isArray(drafts) ? drafts.filter((draft) => valid(draft, userId)) : [];
    } catch (error) {
      return [];
    }
  }

  function save(storage, userId, drafts) {
    if (!storage || !userId) throw new Error('No signed-in user is available for this draft.');
    const owned = (Array.isArray(drafts) ? drafts : []).filter((draft) => valid(draft, userId));
    storage.setItem(key(userId), JSON.stringify(owned));
    return owned;
  }

  return Object.freeze({ key, load, save });
});
