const { context, trace } = require('@opentelemetry/api');
const { logs, SeverityNumber } = require('@opentelemetry/api-logs');
const { OTLPLogExporter } = require('@opentelemetry/exporter-logs-otlp-proto');
const { LoggerProvider, SimpleLogRecordProcessor } = require('@opentelemetry/sdk-logs');
const { NodeSDK } = require('@opentelemetry/sdk-node');
const { getNodeAutoInstrumentations } = require('@opentelemetry/auto-instrumentations-node');

const loggerProvider = new LoggerProvider(process.env.OTEL_EXPORTER_OTLP_ENDPOINT ? {
  processors: [new SimpleLogRecordProcessor(new OTLPLogExporter())],
} : undefined);
if (process.env.OTEL_EXPORTER_OTLP_ENDPOINT) {
  logs.setGlobalLoggerProvider(loggerProvider);
}

const sdk = new NodeSDK({ instrumentations: [getNodeAutoInstrumentations()] });
sdk.start();

const originalConsole = { log: console.log, error: console.error, warn: console.warn };
const severity = { log: SeverityNumber.INFO, warn: SeverityNumber.WARN, error: SeverityNumber.ERROR };
for (const method of Object.keys(originalConsole)) {
  console[method] = (...args) => {
    originalConsole[method](...args);
    if (!process.env.OTEL_EXPORTER_OTLP_ENDPOINT) return;
    const body = args.length === 1 ? args[0] : args.map(String).join(' ');
    const record = logs.getLogger('console').emit({
      body,
      severityNumber: severity[method],
      severityText: method.toUpperCase(),
      attributes: { 'log.type': 'console' },
      context: context.active(),
      timestamp: Date.now(),
    });
    return record;
  };
}

process.once('SIGTERM', async () => {
  await Promise.all([sdk.shutdown(), loggerProvider.shutdown()]);
});