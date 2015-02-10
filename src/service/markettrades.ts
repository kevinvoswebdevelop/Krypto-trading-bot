/// <reference path="utils.ts" />
/// <reference path="../common/models.ts" />
/// <reference path="../common/messaging.ts" />
/// <reference path="../../typings/tsd.d.ts" />

import Models = require("../common/models");
import Messaging = require("../common/messaging");
import Utils = require("./utils");
import momentjs = require('moment');
import Interfaces = require("./interfaces");
import Agent = require("./arbagent");
import _ = require("lodash");
import P = require("./persister");
import Broker = require("./broker");
import mongodb = require('mongodb');

export class MarketTradePersister extends P.Persister<Models.ExchangePairMessage<Models.MarketTrade>> {
    constructor(db : Q.Promise<mongodb.Db>) {
        super(db, "mt", d => P.timeLoader(d.data), d => P.timeSaver(d.data));
    }
}

export class MarketTradeBroker implements Interfaces.IMarketTradeBroker {
    _log : Utils.Logger = Utils.log("tribeca:mtbroker");

    // TOOD: is this event needed?
    MarketTrade = new Utils.Evt<Models.MarketTrade>();
    public get marketTrades() { return this._marketTrades; }

    private _marketTrades : Models.MarketTrade[] = [];
    private handleNewMarketTrade = (u : Models.GatewayMarketTrade) => {
        var qt = u.onStartup ? null : this._quoteGenerator.latestQuote;
        var mkt = u.onStartup ? null : this._mdBroker.currentBook;

        var t = new Models.MarketTrade(u.price, u.size, u.time, qt, mkt.bids[0], mkt.asks[0]);
        this.marketTrades.push(t);
        this.MarketTrade.trigger(t);
        this._marketTradePublisher.publish(t);
        
        if (!u.onStartup)
            this._persister.persist(new Models.ExchangePairMessage(this._base.exchange(), this._base.pair, t));
    };

    constructor(private _mdGateway : Interfaces.IMarketDataGateway,
                private _marketTradePublisher : Messaging.IPublish<Models.MarketTrade>,
                private _mdBroker : Interfaces.IMarketDataBroker,
                private _quoteGenerator : Agent.QuoteGenerator,
                private _base : Broker.ExchangeBroker,
                private _persister : MarketTradePersister) {

        _persister.load(_base.exchange(), _base.pair, 100).then(ts => {
            this._log("loaded %d market trades", ts.length);
            ts.forEach(t => this.marketTrades.push(t.data));
        });

        _marketTradePublisher.registerSnapshot(() => _.last(this.marketTrades, 50));
        this._mdGateway.MarketTrade.on(this.handleNewMarketTrade);
    }
}