export const TM_COLLECTION_CHANGED_EVENT = 'tm-collection-changed'

export function notifyTmCollectionChanged(): void {
  window.dispatchEvent(new CustomEvent(TM_COLLECTION_CHANGED_EVENT))
}
