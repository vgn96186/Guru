import { logger } from '../../logger';

let installed = false;

export function installConsoleInterceptor() {
  if (installed) return;
  installed = true;

  const origLog = console.log;
  const origWarn = console.warn;
  const origError = console.error;
  const origInfo = console.info;
  const origDebug = console.debug;

  console.log = (...args: any[]) => {
    origLog(...args);
    logger.log(
      args.map((a) => (typeof a === 'object' ? JSON.stringify(a) : String(a))).join(' '),
      args,
    );
  };
  console.warn = (...args: any[]) => {
    origWarn(...args);
    logger.warn(
      args.map((a) => (typeof a === 'object' ? JSON.stringify(a) : String(a))).join(' '),
      args,
    );
  };
  console.error = (...args: any[]) => {
    origError(...args);
    logger.error(
      args.map((a) => (typeof a === 'object' ? JSON.stringify(a) : String(a))).join(' '),
      args,
    );
  };
  console.info = (...args: any[]) => {
    origInfo(...args);
    logger.info(
      args.map((a) => (typeof a === 'object' ? JSON.stringify(a) : String(a))).join(' '),
      args,
    );
  };
  console.debug = (...args: any[]) => {
    if (origDebug) origDebug(...args);
    logger.debug(
      args.map((a) => (typeof a === 'object' ? JSON.stringify(a) : String(a))).join(' '),
      args,
    );
  };
}
