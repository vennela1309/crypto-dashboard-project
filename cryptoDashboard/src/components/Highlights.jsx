// src/components/Highlights.jsx
import React, { useEffect, useState } from "react";
import axios from "axios";

const HighlightCard = ({ title, coins }) => (
  <div className="bg-white rounded-2xl shadow p-4 flex-1">
    <h3 className="text-lg font-semibold mb-3">{title}</h3>
    <ul className="space-y-2">
      {coins.map((coin) => (
        <li key={coin.id} className="flex justify-between items-center">
          <div className="flex items-center space-x-2">
            <img
              src={coin.image}
              alt={coin.name}
              className="w-5 h-5 rounded-full"
            />
            <span>{coin.name}</span>
          </div>
          <div className="text-right">
            <p className="text-sm">${coin.current_price?.toLocaleString()}</p>
            {coin.price_change_percentage_24h && (
              <p
                className={
                  coin.price_change_percentage_24h >= 0
                    ? "text-green-500 text-xs"
                    : "text-red-500 text-xs"
                }
              >
                {coin.price_change_percentage_24h.toFixed(2)}%
              </p>
            )}
          </div>
        </li>
      ))}
    </ul>
  </div>
);

export default function Highlights() {
  const [trending, setTrending] = useState([]);
  const [topGainers, setTopGainers] = useState([]);
  const [topLosers, setTopLosers] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const fetchData = async () => {
      try {
        // Trending
        const trendingRes = await axios.get(
          "https://api.coingecko.com/api/v3/search/trending"
        );
        setTrending(
          trendingRes.data.coins.map((c) => ({
            id: c.item.id,
            name: c.item.name,
            image: c.item.small,
            current_price: c.item.price_btc,
            price_change_percentage_24h: null,
          }))
        );

        // Market coins for gainers/losers
        const marketRes = await axios.get(
          "https://api.coingecko.com/api/v3/coins/markets",
          {
            params: {
              vs_currency: "usd",
              order: "market_cap_desc",
              per_page: 100,
              page: 1,
              price_change_percentage: "24h",
            },
          }
        );

        const coins = marketRes.data;
        setTopGainers(
          [...coins]
            .sort(
              (a, b) =>
                b.price_change_percentage_24h - a.price_change_percentage_24h
            )
            .slice(0, 5)
        );
        setTopLosers(
          [...coins]
            .sort(
              (a, b) =>
                a.price_change_percentage_24h - b.price_change_percentage_24h
            )
            .slice(0, 5)
        );
      } catch (err) {
        console.error("Highlights fetch error:", err);
      } finally {
        setLoading(false);
      }
    };

    fetchData();
  }, []);

  if (loading) return <p className="text-center">Loading highlights...</p>;

  return (
    <section className="my-6 grid grid-cols-1 md:grid-cols-3 gap-4">
      <HighlightCard title="🔥 Trending Coins" coins={trending} />
      <HighlightCard title="🚀 Top Gainers" coins={topGainers} />
      <HighlightCard title="📉 Top Losers" coins={topLosers} />
    </section>
  );
}
