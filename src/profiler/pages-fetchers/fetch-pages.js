const { makeFetchPageWorkersPool } = require('./fetch-page-workers-pool.js');
const messages = require('./worker-messages.js');

const serializePages = (pages) => (
  pages
    .map(({ actions, ...rest }) => ({
      ...rest,
      actions: actions && actions
        .map(({ action, ...rest }) => ({
          action: action.toString(),
          ...rest
        }))
    }))
)

const cleanConfig = (config) => ({
  ...config,
  pages: serializePages(config.pages),
  cache: config.cache ? ({
    ...config.cache,
    postDataHandler: config.cache.postDataHandler && config.cache.postDataHandler.toString(),
    responseDataHandler: config.cache.responseDataHandler && config.cache.responseDataHandler.toString()
  }) : config.cache,
  logger: null,
  progress: null,
  checkStatus: null,
  buildData: null
})

const runFetchPagesQueue = async ({ workers, pages, count, checkStatus, logger, dataCb }) => {
  return new Promise((resolve, reject) => {
    const queue = Array(pages.length * count)
      .fill(null)
      .map((a, index) => index % pages.length);
    let expectedResultsCount = queue.length;
    let attemptsCount = 15;
    let attemptTimeout = 5000;

    workers.forEach((worker) => {
      if (queue.length) {
        worker.postMessage({
          type: messages.LOAD_PAGE_START,
          payload: pages[queue.shift()]
        });
      }

      worker.on('message', async ({ type, payload }) => {
        if (type === messages.LOAD_PAGE_COMPLETE) {
          if (queue.length && await checkStatus()) {
            worker.postMessage({
              type: messages.LOAD_PAGE_START,
              payload: pages[queue.shift()]
            });
          }

          expectedResultsCount--;

          await dataCb(payload);

          if (!expectedResultsCount || !(await checkStatus())) {
            resolve();
          }
        } else if (type === messages.LOAD_PAGE_ERROR) {
          if (attemptsCount) {
            if (await checkStatus()) {
              attemptsCount--;

              await logger(`try to retry: ${payload.page.url}`);

              setTimeout(() => {
                worker.postMessage({
                  type: messages.LOAD_PAGE_START,
                  payload: payload.page
                });
              }, attemptTimeout);
            }
          } else {
            reject(new Error('Attempts limit reached.'));
          }
        }
      })
    });
  });
}

const fetchPages = async ({
                            config,
                            cacheBandwidthConfig,
                            percentCost,
                            prepare = (data) => data,
                            onePort
                          }) => {
  const { count, logger, progress, checkStatus } = config;
  const cleanedConfig = cleanConfig(config);

  const { workers, close } = await makeFetchPageWorkersPool({
    config: cleanedConfig,
    cacheBandwidthConfig,
    onePort,
    functions: {
      checkStatus,
      logger
    }
  });

  const pagesResults = {};

  try {
    await runFetchPagesQueue({
      workers,
      pages: cleanedConfig.pages,
      count,
      checkStatus,
      logger,
      dataCb: async ({ page, result }) => {
        if (!pagesResults[page]) {
          pagesResults[page] = [];
        }

        pagesResults[page].push(await prepare(result)); // ToDo preparing on another worker
        await progress(percentCost);
      }
    });

    close();
    return pagesResults;
  } catch (e) {
    await logger(e.stack);

    close();
    return null;
  }
};

module.exports = {
  fetchPages
};