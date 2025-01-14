const getScreenshotsByMetrics = (events, timestamps) => {
  const screenshots = events.filter(({ name }) => name === 'Screenshot');
  const screenshotsReversed = screenshots.slice().reverse();

  const timingsWithScreenshots = timestamps
    .sort((a, b) => a.value - b.value)
    .map(({ value, name }) => ({
      value, name,
      screenshots: [
        screenshotsReversed.find(({ ts }) => ts < value),
        screenshots.find(({ ts }) => ts > value)
      ].filter(Boolean)
    }));

  const filteredScreenshots = timingsWithScreenshots
    .reduce((acc, { value, name, screenshots }) => {
      screenshots.forEach((screenshot) => {
        if (!acc[screenshot.ts]) {
          acc[screenshot.ts] = {
            snapshot: screenshot.args.snapshot,
            timestamp: screenshot.ts,
            events: [{ value, name }]
          };
        } else {
          acc[screenshot.ts].events.push({ value, name });
        }
      });

      return acc;
    }, {});

  return Object.values(filteredScreenshots)
    .reduce((acc, { snapshot, timestamp, events }) => {
      acc.snapshots.push({ snapshot, timestamp });
      acc.events.push(...events);

      return acc;
    }, {
      snapshots: [],
      events: []
    });
};

module.exports = {
  getScreenshotsByMetrics
};
