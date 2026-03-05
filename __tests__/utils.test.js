/**
 * P0-4: Test Coverage - utils.js Tests
 * 모든 유틸리티 함수 테스트 (목표: 100% 커버리지)
 */

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

  test('handles multiple hyphens', () => {
    expect(formatSlugToDisplayName('agent-one-two-three'))
      .toBe('Agent One Two Three');
  });
});

describe('getVisualClassForState', () => {
  test('returns correct class for each state', () => {
    expect(getVisualClassForState('Working')).toBe('is-working');
    expect(getVisualClassForState('Thinking')).toBe('is-working');
    expect(getVisualClassForState('Done')).toBe('is-complete');
    expect(getVisualClassForState('Error')).toBe('is-alert');
    expect(getVisualClassForState('Help')).toBe('is-alert');
    expect(getVisualClassForState('Offline')).toBe('is-offline');
  });

  test('returns default class for unknown state', () => {
    expect(getVisualClassForState('Unknown')).toBe('is-complete');
    expect(getVisualClassForState('Random')).toBe('is-complete');
  });
});

describe('getElapsedTime', () => {
  beforeEach(() => {
    jest.useFakeTimers();
    jest.setSystemTime(new Date('2026-03-05T00:00:00.000Z'));
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

  test('calculates elapsed time for Thinking state', () => {
    const agent = {
      state: 'Thinking',
      activeStartTime: Date.now() - 5000
    };
    const elapsed = getElapsedTime(agent);
    expect(elapsed).toBeGreaterThanOrEqual(4900);
    expect(elapsed).toBeLessThanOrEqual(5100);
  });

  test('returns 0 for unknown state', () => {
    const agent = { state: 'Unknown', activeStartTime: Date.now() };
    expect(getElapsedTime(agent)).toBe(0);
  });

  test('returns 0 when activeStartTime is missing', () => {
    const agent = { state: 'Working' };
    expect(getElapsedTime(agent)).toBe(0);
  });
});

describe('normalizePath', () => {
  test('normalizes Windows paths', () => {
    expect(normalizePath('C:\\Users\\Test\\Project'))
      .toBe('c:/users/test/project');
    expect(normalizePath('D:\\Projects\\MyApp\\'))
      .toBe('d:/projects/myapp');
  });

  test('normalizes Unix paths', () => {
    expect(normalizePath('/home/user/project/'))
      .toBe('/home/user/project');
    expect(normalizePath('/var/log/test'))
      .toBe('/var/log/test');
  });

  test('converts to lowercase', () => {
    expect(normalizePath('C:\\Users\\TEST\\Project'))
      .toBe('c:/users/test/project');
  });

  test('handles empty input', () => {
    expect(normalizePath(null)).toBe('');
    expect(normalizePath(undefined)).toBe('');
    expect(normalizePath('')).toBe('');
  });

  test('handles mixed separators', () => {
    expect(normalizePath('C:\\Users/Test/Project\\'))
      .toBe('c:/users/test/project');
  });
});

describe('safeStatSync', () => {
  test('returns stats when file exists', () => {
    const mockStats = { size: 1024, mtime: new Date() };
    fs.statSync.mockReturnValue(mockStats);

    const result = safeStatSync('/path/to/file');
    expect(result).toEqual(mockStats);
    expect(fs.statSync).toHaveBeenCalledWith('/path/to/file');
  });

  test('returns null when file does not exist', () => {
    fs.statSync.mockImplementation(() => {
      throw new Error('ENOENT');
    });

    const result = safeStatSync('/path/to/nonexistent');
    expect(result).toBeNull();
  });

  test('returns null on permission error', () => {
    fs.statSync.mockImplementation(() => {
      throw new Error('EACCES');
    });

    const result = safeStatSync('/path/to/file');
    expect(result).toBeNull();
  });

  test('handles any error gracefully', () => {
    fs.statSync.mockImplementation(() => {
      throw new Error('Unexpected error');
    });

    const result = safeStatSync('/path/to/file');
    expect(result).toBeNull();
  });
});

describe('safeExistsSync', () => {
  test('returns true when file exists', () => {
    fs.existsSync.mockReturnValue(true);

    expect(safeExistsSync('/path/to/file')).toBe(true);
    expect(fs.existsSync).toHaveBeenCalledWith('/path/to/file');
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

  test('handles various error types', () => {
    fs.existsSync.mockImplementation(() => {
      throw new Error('EACCES');
    });

    expect(safeExistsSync('/path/to/file')).toBe(false);
  });
});
