/** Logger that discards every record; the default everywhere. */
export const silentLogger = {
    info() {
        // Intentionally empty.
    },
    warn() {
        // Intentionally empty.
    },
};
