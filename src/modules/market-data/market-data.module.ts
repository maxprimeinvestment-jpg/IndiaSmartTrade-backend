import { DynamicModule, Global, Logger, Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { MARKET_PROVIDER_TOKEN } from './market-provider.token';
import type { MarketProvider } from './market-provider.interface';
import { MarketController } from './market.controller';
import { MarketService } from './market.service';
import { CompositeMarketProvider } from './providers/composite.provider';
import { MockMarketProvider } from './providers/mock.provider';
import { NseMarketProvider } from './providers/nse.provider';
import { TwelveDataMarketProvider } from './providers/twelvedata.provider';
import type { SymbolDef } from './symbols';

const bootLogger = new Logger('MarketDataModule');

function buildProvider(config: ConfigService): MarketProvider {
  const mode = (config.get<string>('MARKET_PROVIDER') ?? 'multi').toLowerCase();

  if (mode === 'mock') {
    bootLogger.log('Using mock provider for all symbols');
    return new MockMarketProvider(config);
  }

  if (mode === 'twelvedata' || mode === 'twelve_data') {
    if (!config.get<string>('MARKET_API_KEY')) {
      bootLogger.warn('MARKET_PROVIDER=twelvedata but MARKET_API_KEY missing — using mock');
      return new MockMarketProvider(config);
    }
    bootLogger.log('Using Twelve Data for all symbols (standalone)');
    return new TwelveDataMarketProvider(config);
  }

  // mode === 'multi' (default) — TwelveData (or Mock) for GLOBAL, NSE for IN
  const globalFilter = (s: SymbolDef) => s.region === 'GLOBAL';
  const hasApiKey = !!config.get<string>('MARKET_API_KEY');
  const globalProvider = hasApiKey
    ? new TwelveDataMarketProvider(config, globalFilter)
    : new MockMarketProvider(config, globalFilter);
  const indianProvider = new NseMarketProvider(config);
  bootLogger.log(
    `Multi-provider: global=${globalProvider.providerName} (key=${hasApiKey ? 'yes' : 'no'}), indian=${indianProvider.providerName}`,
  );
  return new CompositeMarketProvider([globalProvider, indianProvider]);
}

@Global()
@Module({})
export class MarketDataModule {
  static register(): DynamicModule {
    return {
      module: MarketDataModule,
      imports: [ConfigModule],
      controllers: [MarketController],
      providers: [
        {
          provide: MARKET_PROVIDER_TOKEN,
          inject: [ConfigService],
          useFactory: (config: ConfigService) => buildProvider(config),
        },
        MarketService,
      ],
      exports: [MARKET_PROVIDER_TOKEN, MarketService],
    };
  }
}
