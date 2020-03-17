const path = require('path');

const globalTTIName = 'overlookerTTI';
const runTTIObserver = (name) => {
    if(window[name]){
        return;
    }

    const globalTTI = window[name] = { e: [] };

    globalTTI.o = new PerformanceObserver(function(list) {
        const entries = list.getEntries();

        globalTTI.e = globalTTI.e.concat(entries);
    });
    globalTTI.o.observe({ entryTypes: ['longtask'] });
};

const injectLongTasksObserver = async (page) => {
     /* istanbul ignore next */
    await page.evaluateOnNewDocument(runTTIObserver, globalTTIName);
}
const getTti = async (page, logger) => {
    let ttiPolyfillUpdates = 0;
    await page.exposeFunction('countTtiPolyfillUpdate', () => {
        ++ttiPolyfillUpdates;
        if(ttiPolyfillUpdates > 1){
            logger('ttiPolyfill was rewritten')
        }
    });    
   
     /* istanbul ignore next */
    await page.evaluate(() => {
        let target = null;
        Object.defineProperty(window, 'ttiPolyfill', {
            configurable: true,
            set(value){
                target = value;
                window.countTtiPolyfillUpdate();
            },
            get(){
                return target;
            }
        })
    })

    await page.addScriptTag({ path: path.resolve(__dirname, './tti-polyfill.js') });

     /* istanbul ignore next */
    const result = await page.evaluate(({ttiPropName}) => {
        if(!window.ttiPolyfill || !window.ttiPolyfill.getFirstConsistentlyInteractive){
            return 60000;
        }
        return window.ttiPolyfill.getFirstConsistentlyInteractive({ttiPropName});
    }, {ttiPropName: globalTTIName})

    return result;
}

module.exports = {
    injectLongTasksObserver,
    getTti
};
  