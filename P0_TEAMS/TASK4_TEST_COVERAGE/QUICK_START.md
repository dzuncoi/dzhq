# 테스트 주도 개발 빠른 시작 가이드

**목표:** 24시간 내 20% 커버리지 달성
**대상:** 개발팀 전체
**소요 시간:** 5분 읽기

---

## 1. 즉시 시작 (5분)

### Step 1: Jest 설치

```bash
npm install --save-dev jest @types/jest
```

### Step 2: package.json에 스크립트 추가

```json
{
  "scripts": {
    "test": "jest",
    "test:coverage": "jest --coverage",
    "test:watch": "jest --watch"
  }
}
```

### Step 3: Jest 설정 (jest.config.js)

```javascript
module.exports = {
  testEnvironment: 'node',
  coverageDirectory: 'coverage',
  collectCoverageFrom: [
    '*.js',
    '!node_modules/**',
    '!coverage/**'
  ],
  coverageThreshold: {
    global: {
      branches: 20,
      functions: 20,
      lines: 20,
      statements: 20
    }
  }
};
```

### Step 4: 첫 번째 테스트 작성

**파일:** `__tests__/utils.test.js`

```javascript
const {
  formatSlugToDisplayName,
  getVisualClassForState
} = require('../utils');

describe('formatSlugToDisplayName', () => {
  test('converts slug to title case', () => {
    expect(formatSlugToDisplayName('toasty-sparking-lecun'))
      .toBe('Toasty Sparking Lecun');
  });

  test('handles empty input', () => {
    expect(formatSlugToDisplayName(null)).toBe('Agent');
    expect(formatSlugToDisplayName(undefined)).toBe('Agent');
    expect(formatSlugToDisplayName('')).toBe('Agent');
  });

  test('handles single word', () => {
    expect(formatSlugToDisplayName('claude')).toBe('Claude');
  });
});

describe('getVisualClassForState', () => {
  test('returns correct class for each state', () => {
    expect(getVisualClassForState('Working')).toBe('is-working');
    expect(getVisualClassForState('Thinking')).toBe('is-working');
    expect(getVisualClassForState('Done')).toBe('is-complete');
    expect(getVisualClassForState('Error')).toBe('is-alert');
    expect(getVisualClassForState('Help')).toBe('is-alert');
  });

  test('returns default class for unknown state', () => {
    expect(getVisualClassForState('Unknown')).toBe('is-complete');
  });
});
```

### Step 5: 테스트 실행

```bash
npm test
```

**출력:**
```
PASS  __tests__/utils.test.js
  formatSlugToDisplayName
    ✓ converts slug to title case (3ms)
    ✓ handles empty input (1ms)
    ✓ handles single word (1ms)
  getVisualClassForState
    ✓ returns correct class for each state (2ms)
    ✓ returns default class for unknown state (1ms)

Test Suites: 1 passed, 1 total
Tests:       5 passed, 5 total
```

**커버리지 확인:**
```bash
npm run test:coverage
```

---

## 2. utils.js 테스트 완료 (2시간)

### 모든 함수 테스트

**파일:** `__tests__/utils.test.js` (추가)

```javascript
const {
  formatSlugToDisplayName,
  getVisualClassForState,
  getElapsedTime,
  normalizePath,
  safeStatSync,
  safeExistsSync
} = require('../utils');
const fs = require('fs');

// Mock fs module
jest.mock('fs');

describe('getElapsedTime', () => {
  beforeEach(() => {
    jest.useFakeTimers();
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  test('returns 0 for Done state with no duration', () => {
    const agent = { state: 'Done', lastDuration: 0 };
    expect(getElapsedTime(agent)).toBe(0);
  });

  test('returns lastDuration for Done state', () => {
    const agent = { state: 'Done', lastDuration: 5000 };
    expect(getElapsedTime(agent)).toBe(5000);
  });

  test('calculates elapsed time for Working state', () => {
    const agent = {
      state: 'Working',
      activeStartTime: Date.now() - 10000
    };
    const elapsed = getElapsedTime(agent);
    expect(elapsed).toBeGreaterThanOrEqual(9900);
    expect(elapsed).toBeLessThanOrEqual(10100);
  });

  test('returns 0 for unknown state', () => {
    const agent = { state: 'Unknown', activeStartTime: Date.now() };
    expect(getElapsedTime(agent)).toBe(0);
  });
});

describe('normalizePath', () => {
  test('normalizes Windows paths', () => {
    expect(normalizePath('C:\\Users\\Test\\Project'))
      .toBe('c:/users/test/project');
  });

  test('normalizes Unix paths', () => {
    expect(normalizePath('/home/user/project/'))
      .toBe('/home/user/project');
  });

  test('handles empty input', () => {
    expect(normalizePath(null)).toBe('');
    expect(normalizePath(undefined)).toBe('');
  });
});

describe('safeStatSync', () => {
  test('returns stats when file exists', () => {
    const mockStats = { size: 1024, mtime: new Date() };
    fs.statSync.mockReturnValue(mockStats);

    const result = safeStatSync('/path/to/file');
    expect(result).toEqual(mockStats);
  });

  test('returns null when file does not exist', () => {
    fs.statSync.mockImplementation(() => {
      throw new Error('ENOENT');
    });

    const result = safeStatSync('/path/to/nonexistent');
    expect(result).toBeNull();
  });
});

describe('safeExistsSync', () => {
  test('returns true when file exists', () => {
    fs.existsSync.mockReturnValue(true);

    expect(safeExistsSync('/path/to/file')).toBe(true);
  });

  test('returns false when file does not exist', () => {
    fs.existsSync.mockReturnValue(false);

    expect(safeExistsSync('/path/to/nonexistent')).toBe(false);
  });

  test('returns false on error', () => {
    fs.existsSync.mockImplementation(() => {
      throw new Error('Error');
    });

    expect(safeExistsSync('/path/to/file')).toBe(false);
  });
});
```

**실행:** `npm test`

**예상 커버리지:** utils.js 100%

---

## 3. agentManager.js 테스트 (6시간)

### 리팩토링 최소화

**변경 전:**
```javascript
const fs = require('fs');

class AgentManager extends EventEmitter {
  constructor() {
    super();
    // ...
  }

  updateAgent(entry, source = 'log') {
    // ...
    if (fs.existsSync(path)) {
      // ...
    }
  }
}
```

**변경 후:**
```javascript
class AgentManager extends EventEmitter {
  constructor(fileSystem = require('fs')) {
    super();
    this.fs = fileSystem;
  }

  updateAgent(entry, source = 'log') {
    // ...
    if (this.fs.existsSync(path)) {
      // ...
    }
  }
}
```

### 테스트 코드

**파일:** `__tests__/agentManager.test.js`

```javascript
const AgentManager = require('../agentManager');
const EventEmitter = require('events');
const fs = require('fs');

// Mock fs
jest.mock('fs');

describe('AgentManager', () => {
  let manager;
  let mockClock;

  beforeEach(() => {
    // Mock file system
    mockFs = {
      existsSync: jest.fn(),
      statSync: jest.fn()
    };

    manager = new AgentManager(mockFs);
    manager.start();
  });

  afterEach(() => {
    manager.stop();
    jest.clearAllMocks();
  });

  describe('updateAgent', () => {
    test('adds new agent', () => {
      const entry = {
        sessionId: 'test-1',
        slug: 'test-agent',
        state: 'Working',
        projectPath: '/path/to/project'
      };

      const result = manager.updateAgent(entry);

      expect(result).not.toBeNull();
      expect(result.id).toBe('test-1');
      expect(result.state).toBe('Working');
      expect(result.displayName).toBe('Test Agent');
    });

    test('updates existing agent state', () => {
      const entry1 = {
        sessionId: 'test-2',
        slug: 'agent-two',
        state: 'Working'
      };

      const entry2 = {
        sessionId: 'test-2',
        state: 'Done'
      };

      manager.updateAgent(entry1);
      manager.updateAgent(entry2);

      const agent = manager.getAgent('test-2');
      expect(agent.state).toBe('Done');
      expect(agent.lastDuration).toBeGreaterThan(0);
    });

    test('emits agent-added event for new agent', () => {
      const mockCallback = jest.fn();
      manager.on('agent-added', mockCallback);

      const entry = {
        sessionId: 'test-3',
        slug: 'new-agent',
        state: 'Thinking'
      };

      manager.updateAgent(entry);

      expect(mockCallback).toHaveBeenCalledTimes(1);
      expect(mockCallback).toHaveBeenCalledWith(
        expect.objectContaining({ id: 'test-3' })
      );
    });

    test('emits agent-state-changed event on state change', () => {
      const mockCallback = jest.fn();
      manager.on('agent-state-changed', mockCallback);

      const entry1 = { sessionId: 'test-4', state: 'Working' };
      const entry2 = { sessionId: 'test-4', state: 'Done' };

      manager.updateAgent(entry1);
      manager.updateAgent(entry2);

      expect(mockCallback).toHaveBeenCalledTimes(1);
      expect(mockCallback).toHaveBeenCalledWith(
        expect.objectContaining({
          id: 'test-4',
          state: 'Done'
        }),
        'Working'
      );
    });

    test('tracks active duration correctly', () => {
      const entry1 = { sessionId: 'test-5', state: 'Working' };
      const entry2 = { sessionId: 'test-5', state: 'Done' };

      jest.useFakeTimers();
      manager.updateAgent(entry1);

      jest.advanceTimersByTime(5000);

      manager.updateAgent(entry2);

      const agent = manager.getAgent('test-5');
      expect(agent.lastDuration).toBe(5000);

      jest.useRealTimers();
    });
  });

  describe('cleanupIdleAgents', () => {
    test('removes agents idle longer than timeout', () => {
      const entry = {
        sessionId: 'idle-agent',
        slug: 'idle',
        state: 'Done'
      };

      manager.updateAgent(entry);

      // Simulate time passing
      jest.useFakeTimers();
      jest.advanceTimersByTime(11 * 60 * 1000); // 11 minutes

      manager.cleanupIdleAgents();

      const agent = manager.getAgent('idle-agent');
      expect(agent).toBeUndefined();

      jest.useRealTimers();
    });

    test('keeps active agents', () => {
      const entry = {
        sessionId: 'active-agent',
        slug: 'active',
        state: 'Working'
      };

      manager.updateAgent(entry);

      jest.useFakeTimers();
      jest.advanceTimersByTime(11 * 60 * 1000);

      manager.cleanupIdleAgents();

      const agent = manager.getAgent('active-agent');
      expect(agent).toBeDefined();

      jest.useRealTimers();
    });
  });

  describe('getAgentWithEffectiveState', () => {
    test('returns agent with effective state', () => {
      const entry = {
        sessionId: 'test-6',
        slug: 'test',
        state: 'Working',
        isSubagent: true
      };

      manager.updateAgent(entry);

      const agent = manager.getAgentWithEffectiveState('test-6');
      expect(agent).toBeDefined();
      expect(agent.effectiveState).toBeDefined();
    });
  });
});
```

---

## 4. main.js IPC 테스트 (6시간)

### 모듈 분리

**새 파일:** `ipcHandlers.js`

```javascript
function setupIpcHandlers(ipcMain, agentManager, mainWindow) {
  ipcMain.on('agent-update', (event, agentData) => {
    const agent = agentManager.updateAgent(agentData);
    if (agent) {
      event.reply('agent-updated', agent);
    }
  });

  ipcMain.on('get-agents', (event) => {
    const agents = Array.from(agentManager.agents.values());
    event.reply('agents-list', agents);
  });

  // ... more handlers
}

module.exports = { setupIpcHandlers };
```

### 테스트 코드

**파일:** `__tests__/ipcHandlers.test.js`

```javascript
const { setupIpcHandlers } = require('../ipcHandlers');
const AgentManager = require('../agentManager');

describe('IPC Handlers', () => {
  let mockIpcMain;
  let mockAgentManager;
  let mockMainWindow;
  let eventCallbacks;

  beforeEach(() => {
    eventCallbacks = {};

    mockIpcMain = {
      on: jest.fn((channel, callback) => {
        eventCallbacks[channel] = callback;
      })
    };

    mockAgentManager = new AgentManager();
    mockAgentManager.start();

    mockMainWindow = {
      send: jest.fn()
    };

    setupIpcHandlers(mockIpcMain, mockAgentManager, mockMainWindow);
  });

  afterEach(() => {
    mockAgentManager.stop();
  });

  describe('agent-update handler', () => {
    test('updates agent and replies', () => {
      const mockEvent = {
        reply: jest.fn()
      };

      const agentData = {
        sessionId: 'test-1',
        slug: 'test',
        state: 'Working'
      };

      // Trigger the handler
      eventCallbacks['agent-update'](mockEvent, agentData);

      expect(mockAgentManager.getAgent('test-1')).toBeDefined();
      expect(mockEvent.reply).toHaveBeenCalledWith(
        'agent-updated',
        expect.objectContaining({ id: 'test-1' })
      );
    });
  });

  describe('get-agents handler', () => {
    test('returns all agents', () => {
      const mockEvent = {
        reply: jest.fn()
      };

      // Add some agents
      mockAgentManager.updateAgent({ sessionId: 'agent-1', state: 'Working' });
      mockAgentManager.updateAgent({ sessionId: 'agent-2', state: 'Done' });

      // Trigger handler
      eventCallbacks['get-agents'](mockEvent);

      expect(mockEvent.reply).toHaveBeenCalledWith(
        'agents-list',
        expect.arrayContaining([
          expect.objectContaining({ id: 'agent-1' }),
          expect.objectContaining({ id: 'agent-2' })
        ])
      );
    });
  });
});
```

---

## 5. 커버리지 확인 및 리포트

### 커버리지 실행

```bash
npm run test:coverage
```

### 출력 예시

```
--------------------|---------|----------|---------|---------|-------------------
File                | % Stmts | % Branch | % Funcs | % Lines | Uncovered Line #s
--------------------|---------|----------|---------|---------|-------------------
All files           |   20.15 |    18.32 |   22.45 |   20.12 |
 agentManager.js    |   70.12 |    65.43 |   75.23 |   68.91 | 145-167, 189-201
 ipcHandlers.js     |   50.34 |    45.12 |   55.67 |   48.23 | 34-56, 78-90
 utils.js           |  100.00 |   100.00 |  100.00 |  100.00 |
--------------------|---------|----------|---------|---------|-------------------
```

### HTML 리포트

```bash
open coverage/lcov-report/index.html
```

---

## 6. CI/CD 설정 (3시간)

### GitHub Actions

**파일:** `.github/workflows/test.yml`

```yaml
name: Test

on:
  push:
    branches: [ master, main ]
  pull_request:
    branches: [ master, main ]

jobs:
  test:
    runs-on: ubuntu-latest

    strategy:
      matrix:
        node-version: [16.x, 18.x]

    steps:
    - uses: actions/checkout@v3

    - name: Use Node.js ${{ matrix.node-version }}
      uses: actions/setup-node@v3
      with:
        node-version: ${{ matrix.node-version }}

    - name: Install dependencies
      run: npm ci

    - name: Run tests
      run: npm test

    - name: Generate coverage report
      run: npm run test:coverage

    - name: Upload coverage to Codecov
      uses: codecov/codecov-action@v3
      with:
        files: ./coverage/lcov.info
        flags: unittests
        name: codecov-umbrella
```

---

## 7. 빠른 참조

### 테스트 작성 팁

**1. AAA 패턴 따르기**
```javascript
test('calculates elapsed time', () => {
  // Arrange (준비)
  const agent = { state: 'Working', activeStartTime: Date.now() - 10000 };

  // Act (실행)
  const result = getElapsedTime(agent);

  // Assert (검증)
  expect(result).toBeGreaterThanOrEqual(9900);
});
```

**2. 한 테스트에 하나만 검증**
```javascript
// ❌ 나쁨
test('agent updates', () => {
  expect(agent.state).toBe('Working');
  expect(agent.slug).toBe('test');
  expect(agent.id).toBe('test-1');
});

// ✅ 좋음
test('agent has correct state', () => {
  expect(agent.state).toBe('Working');
});

test('agent has correct slug', () => {
  expect(agent.slug).toBe('test');
});
```

**3. Mock을 적극 활용**
```javascript
// 파일 시스템 Mock
jest.mock('fs', () => ({
  existsSync: jest.fn(),
  readFileSync: jest.fn()
}));

// Electron Mock
jest.mock('electron', () => ({
  ipcMain: {
    on: jest.fn()
  }
}));
```

### 자주 쓰는 Matcher

```javascript
// 동등성
expect(value).toBe(expected);
expect(object).toEqual(expected);

// 진리/거짓
expect(value).toBeTruthy();
expect(value).toBeFalsy();

// 배열
expect(array).toContain(item);
expect(array).toHaveLength(3);

// 예외
expect(() => fn()).toThrow('Error message');

// 비동기
await expect(promise).resolves.toBe(value);
await expect(promise).rejects.toThrow();
```

---

## 8. 문제 해결

### 문제: Electron 모듈 에러

**해결:** `jest.config.js`에 모듈 모킹 추가

```javascript
module.exports = {
  moduleNameMapper: {
    '^electron$': '<rootDir>/__mocks__/electron.js'
  }
};
```

**파일:** `__mocks__/electron.js`

```javascript
module.exports = {
  app: { getPath: jest.fn() },
  BrowserWindow: jest.fn(),
  ipcMain: { on: jest.fn(), handle: jest.fn() },
  ipcRenderer: { on: jest.fn(), send: jest.fn() }
};
```

### 문제: 타이머 관련 테스트 실패

**해결:** Fake Timers 사용

```javascript
beforeEach(() => {
  jest.useFakeTimers();
});

afterEach(() => {
  jest.useRealTimers();
});

test('timer test', () => {
  const callback = jest.fn();
  setTimeout(callback, 1000);

  jest.advanceTimersByTime(1000);

  expect(callback).toHaveBeenCalled();
});
```

---

## 9. 진척도 체크리스트

### Day 1: 기반 구축
- [ ] Jest 설치 완료
- [ ] 첫 번째 테스트 통과
- [ ] utils.js 테스트 완료 (100%)
- [ ] 커버리지 4% 달성

### Day 2: 핵심 로직
- [ ] agentManager.js 리팩토링
- [ ] updateAgent 테스트 완료
- [ ] cleanupIdleAgents 테스트 완료
- [ ] 커버리지 12% 달성

### Day 3: IPC + CI/CD
- [ ] ipcHandlers.js 분리
- [ ] IPC 핸들러 테스트 완료
- [ ] GitHub Actions 설정
- [ ] 커버리지 20% 달성
- [ ] CI/CD 파이프라인 가동

---

## 10. 도움말

**문서:**
- Jest 공식: https://jestjs.io/
- Testing Library: https://testing-library.com/

**팀 문의:**
- 테스트 관련 질문: #test-coverage 채널
- Code Review 요청: Pull Request 생성
- 긴급 이슈: @test-coverage-lead 멘션

---

**마지막 업데이트:** 2026-03-05
**다음 리뷰:** Day 1 저녁 (진척도 확인)
