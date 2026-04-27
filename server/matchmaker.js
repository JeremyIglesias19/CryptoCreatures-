// ============================================
// Matchmaker - Emparejamiento por ELO
// ============================================

class Matchmaker {
  constructor() {
    this.queue = new Map(); // playerId -> entry
    this.ELO_RANGE_BASE = 100;
    this.ELO_RANGE_EXPANSION = 50; // Se expande cada 10 segundos
    this.MAX_ELO_RANGE = 300;
    this._onMatch = null; // callback for periodic matching
  }

  addToQueue(entry) {
    entry.joinedAt = Date.now();
    this.queue.set(entry.id, entry);
  }

  removeFromQueue(playerId) {
    this.queue.delete(playerId);
  }

  queueSize() {
    return this.queue.size;
  }

  // Set callback for when periodic scan finds a match
  onMatch(callback) {
    this._onMatch = callback;
  }

  tryMatch(newEntry) {
    let bestMatch = null;
    let bestEloDiff = Infinity;

    for (const [id, entry] of this.queue) {
      if (id === newEntry.id) continue;

      const eloDiff = Math.abs(newEntry.elo - entry.elo);

      // Check expanded range for BOTH players (use the max of both)
      const newWait = (Date.now() - newEntry.joinedAt) / 1000;
      const entryWait = (Date.now() - entry.joinedAt) / 1000;
      const maxWait = Math.max(newWait, entryWait);

      const maxRange = Math.min(
        this.ELO_RANGE_BASE + Math.floor(maxWait / 10) * this.ELO_RANGE_EXPANSION,
        this.MAX_ELO_RANGE
      );

      if (eloDiff <= maxRange && eloDiff < bestEloDiff) {
        bestMatch = entry;
        bestEloDiff = eloDiff;
      }
    }

    if (bestMatch) {
      this.queue.delete(bestMatch.id);
      this.queue.delete(newEntry?.id);
      return { player1: newEntry, player2: bestMatch };
    }
    return null;
  }

  // Periodic scan: tries to match anyone in queue with expanded ranges
  scanForMatches() {
    if (this.queue.size < 2) return null;

    const entries = [...this.queue.values()];
    for (let i = 0; i < entries.length; i++) {
      const match = this.tryMatch(entries[i]);
      if (match) return match;
    }
    return null;
  }

  // Start periodic scanning every 5 seconds
  startPeriodicScan() {
    this._scanInterval = setInterval(() => {
      if (this.queue.size < 2) return;
      const match = this.scanForMatches();
      if (match && this._onMatch) {
        this._onMatch(match);
      }
    }, 5000);
  }

  stopPeriodicScan() {
    if (this._scanInterval) clearInterval(this._scanInterval);
  }
}

module.exports = { Matchmaker };
