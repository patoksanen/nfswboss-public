import path from "path";
import { fileURLToPath } from "url";
import { createClient } from "@supabase/supabase-js";
import express from "express";
import cors from "cors";
import dotenv from "dotenv";
import session from "express-session";

dotenv.config();
if (!process.env.SUPABASE_URL || !process.env.SUPABASE_SERVICE_ROLE_KEY) {
  throw new Error("Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY");
}
const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);
const app = express();
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const FRONTEND_URL = process.env.FRONTEND_URL || "http://localhost:8000";
const APP_TIMEZONE = "Europe/Stockholm";
async function cleanupOldWeeklyData() {
  const { start } = getCurrentWeekWindowStockholm();

  const { error: killsError } = await supabase
    .from("kills")
    .delete()
    .lt("kill_time", start.toISOString());

  if (killsError) {
    throw killsError;
  }

  const { error: layersError } = await supabase
    .from("layers")
    .delete()
    .lt("first_seen", start.toISOString());

  if (layersError) {
    throw layersError;
  }
}
function getCurrentWeekWindowStockholm() {
  const now = new Date();

  const nowInStockholm = new Date(
    new Intl.DateTimeFormat("sv-SE", {
      timeZone: APP_TIMEZONE,
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
      second: "2-digit",
      hourCycle: "h23"
    }).format(now).replace(" ", "T")
  );

  const day = nowInStockholm.getDay(); // Sun=0, Mon=1, Tue=2, Wed=3...
  let daysSinceWednesday = (day - 3 + 7) % 7;

  const start = new Date(nowInStockholm);
  start.setHours(3, 0, 0, 0);
  start.setDate(start.getDate() - daysSinceWednesday);

  if (nowInStockholm < start) {
    start.setDate(start.getDate() - 7);
  }

  const end = new Date(start);
  end.setDate(end.getDate() + 7);

  return { start, end };
}
app.use(cors({
  origin: FRONTEND_URL,
  credentials: true
}));

app.use(express.json());
const isProduction = process.env.NODE_ENV === "production";

if (isProduction) {
  app.set("trust proxy", 1);
}

app.use(session({
  name: "nfsworldboss.sid",
  secret: process.env.SESSION_SECRET || "dev-secret-change-me",
  resave: false,
  saveUninitialized: false,
  rolling: true,
  cookie: {
    httpOnly: true,
    sameSite: "lax",
    secure: isProduction,
    maxAge: 1000 * 60 * 60 * 24 * 7
  }
}));

function getAllowedDiscordIds() {
  return (process.env.ALLOWED_DISCORD_IDS || "")
    .split(",")
    .map((id) => id.trim())
    .filter(Boolean);
}

function requireLogin(req, res, next) {
  if (!req.session.user) {
    return res.status(401).json({ error: "Not logged in" });
  }

  next();
}

app.get("/", (req, res) => {
  res.sendFile(path.join(__dirname, "index.html"));
});

app.get("/auth/discord", (req, res) => {
  const params = new URLSearchParams({
    client_id: process.env.DISCORD_CLIENT_ID,
    redirect_uri: process.env.DISCORD_REDIRECT_URI,
    response_type: "code",
    scope: "identify"
  });

  res.redirect(`https://discord.com/oauth2/authorize?${params.toString()}`);
});

app.get("/auth/discord/callback", async (req, res) => {
  try {
    const code = req.query.code;

    if (!code) {
      return res.status(400).send("Missing Discord code");
    }

    const tokenResponse = await fetch("https://discord.com/api/oauth2/token", {
      method: "POST",
      headers: {
        "Content-Type": "application/x-www-form-urlencoded"
      },
      body: new URLSearchParams({
        client_id: process.env.DISCORD_CLIENT_ID,
        client_secret: process.env.DISCORD_CLIENT_SECRET,
        grant_type: "authorization_code",
        code,
        redirect_uri: process.env.DISCORD_REDIRECT_URI
      })
    });

    const tokenData = await tokenResponse.json();

    if (!tokenResponse.ok) {
      console.error("Discord token error:", tokenData);
      return res.status(500).send("Discord token exchange failed");
    }

    const userResponse = await fetch("https://discord.com/api/users/@me", {
      headers: {
        Authorization: `Bearer ${tokenData.access_token}`
      }
    });

    const discordUser = await userResponse.json();

    if (!userResponse.ok) {
      console.error("Discord user error:", discordUser);
      return res.status(500).send("Could not fetch Discord user");
    }

    const allowedIds = getAllowedDiscordIds();

    if (!allowedIds.includes(discordUser.id)) {
      return res.status(403).send("You are not allowed to access this website.");
    }

    req.session.user = {
  id: discordUser.id,
  username: discordUser.username,
  globalName: discordUser.global_name
};

req.session.save(() => {
  res.redirect(FRONTEND_URL);
});
  } catch (error) {
    console.error("Discord login error:", error);
    res.status(500).send("Discord login failed");
  }
});

app.get("/api/me", (req, res) => {
  if (!req.session.user) {
    return res.status(401).json({
      loggedIn: false
    });
  }

  res.json({
    loggedIn: true,
    user: req.session.user
  });
});
app.get("/api/schedule", requireLogin, async (req, res) => {
  try {
    await cleanupOldWeeklyData();
    const { data: layers, error: layersError } = await supabase
      .from("layers")
      .select("*")
      .order("layer_id", { ascending: true });

    if (layersError) {
      throw layersError;
    }

    const { data: kills, error: killsError } = await supabase
      .from("kills")
      .select("*");

    if (killsError) {
      throw killsError;
    }

    const formattedLayers = layers.map((layer) => {
      const layerKills = kills.filter((kill) => kill.layer_id === layer.layer_id);

      return {
        id: layer.id,
        layerId: layer.layer_id,
        firstSeen: layer.first_seen,
        scoutName: "Unknown",
        kills: {
          Kazzak: {
            killTime: layerKills.find((kill) => kill.boss === "Kazzak")?.kill_time || null,
            killScoutName: layerKills.find((kill) => kill.boss === "Kazzak")?.scout_name || null
          },
          Azuregos: {
            killTime: layerKills.find((kill) => kill.boss === "Azuregos")?.kill_time || null,
            killScoutName: layerKills.find((kill) => kill.boss === "Azuregos")?.scout_name || null
          }
        }
      };
    });

    res.json({
      layers: formattedLayers
    });
  } catch (error) {
    console.error("Schedule load error:", error);
    res.status(500).json({ error: "Could not load schedule" });
  }
});
app.post("/api/layers", requireLogin, async (req, res) => {
  try {
    await cleanupOldWeeklyData();
    const { layerId, firstSeen } = req.body;

    if (!layerId || !firstSeen) {
      return res.status(400).json({ error: "Missing layerId or firstSeen" });
    }

    const { data, error } = await supabase
      .from("layers")
      .insert({
        layer_id: Number(layerId),
        first_seen: firstSeen
      })
      .select()
      .single();

    if (error) {
      if (error.code === "23505") {
        return res.status(409).json({ error: "Layer ID already exists" });
      }

      throw error;
    }

    res.json({ layer: data });
  } catch (error) {
    console.error("Add layer error:", error);
    res.status(500).json({ error: "Could not add layer" });
  }
});
app.delete("/api/layers/:layerId", requireLogin, async (req, res) => {
  try {
    const layerId = Number(req.params.layerId);

    const { error } = await supabase
      .from("layers")
      .delete()
      .eq("layer_id", layerId);

    if (error) {
      throw error;
    }

    res.json({ success: true });
  } catch (error) {
    console.error("Delete layer error:", error);
    res.status(500).json({ error: "Could not delete layer" });
  }
});
app.post("/api/kills", requireLogin, async (req, res) => {
  try {
    await cleanupOldWeeklyData();
    const { layerId, boss, killTime, scoutName } = req.body;

    if (!layerId || !boss || !killTime || !scoutName) {
      return res.status(400).json({ error: "Missing kill data" });
    }

    const { data, error } = await supabase
      .from("kills")
      .upsert(
        {
          layer_id: Number(layerId),
          boss,
          kill_time: killTime,
          scout_name: scoutName
        },
        {
          onConflict: "layer_id,boss"
        }
      )
      .select()
      .single();

    if (error) {
      throw error;
    }

    res.json({ kill: data });
  } catch (error) {
    console.error("Register kill error:", error);
    res.status(500).json({ error: "Could not register kill" });
  }
});

app.post("/api/logout", (req, res) => {
  req.session.destroy(() => {
    res.json({ success: true });
  });
});

app.post("/api/discord-alert", requireLogin, async (req, res) => {
  try {
    const { message } = req.body;

    if (!message) {
      return res.status(400).json({ error: "Missing message" });
    }

    if (!process.env.DISCORD_WEBHOOK_URL) {
      return res.status(500).json({ error: "Missing Discord webhook URL" });
    }

    const response = await fetch(process.env.DISCORD_WEBHOOK_URL, {
      method: "POST",
      headers: {
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
  content: message,
  allowed_mentions: {
    parse: ["roles"]
  }
})
    });

    if (!response.ok) {
      const text = await response.text();
      console.error("Discord webhook error:", text);
      return res.status(500).json({ error: "Discord webhook failed" });
    }

    res.json({ success: true });
  } catch (error) {
    console.error("Backend alert error:", error);
    res.status(500).json({ error: "Server error" });
  }
});

const PORT = process.env.PORT || 3000;
app.use(express.static(__dirname));
app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});