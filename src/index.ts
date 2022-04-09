import { runTestCase } from './helper';
import { testCasePerStore } from './test-case-per-store';
import { testCaseSharding } from './test-case-sharding';
import { testCaseDynamicStores } from './test-dynamic-stores';

(window as any).testCasePerStore = () => {
    runTestCase(
        testCasePerStore,
        10
    );
};


(window as any).testCaseDynamicStores = () => {
    runTestCase(
        testCaseDynamicStores,
        20
    );
};


(window as any).testCaseSharding = () => {
    runTestCase(
        testCaseSharding,
        20
    );
};
