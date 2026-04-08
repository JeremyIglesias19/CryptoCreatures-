// ============================================
// Matchmaker - Emparejamiento por ELO
// ============================================

class Matchmaker {
  constructor() {
    this.queue = new Map(); // playerId -> entry
    this.ELO_RANGE_BASE = 100;
    this.ELO_RANGE_EXPANSION = 50; // Se expande cada 10 segundos
    this.MAX_ELO_RANGE = 500;
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

  tryMatch(newEntry) {
    let bestMatch = null;
    let bestEloDiff = Infinity;

    for (const [id, entry] of this.queue) {
      if (id === newEntry.id) continue;

      const eloDiff = Math.abs(newEntry.elo - entry.elo);
      const waitTime = (Date.now() - entry.joinedAt) / 1000;
      const maxRange = Math.min(
        this.ELO_RANGE_BASE + Math.floor(waitTime / 10) * this.ELO_RANGE_EXPANSION,
        this.MAX_ELO_RANGE
      );

      if (eloDiff <= maxRange && eloDiff < bestEloDiff) {
        bestMatch = entry;
        bestEloDiff = eloDiff;
      }
    }

    if (bestMatch) {
      return { player1: newEntry, player2: bestMatch };
    }
    return null;
  }
}

module.exports = { Matchmaker };
