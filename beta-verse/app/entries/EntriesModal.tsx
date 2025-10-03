// app/entries/EntriesModal.tsx
import React, { useMemo } from "react";
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  Modal,
  Pressable,
  FlatList,
  Platform,
} from "react-native";
import { RFValue } from "react-native-responsive-fontsize";

const PURPLE = "#613DC1";
const GOLD = "#FFD700";
const BORDER = "rgba(255,255,255,0.14)";
const DIV = "rgba(255,255,255,0.10)";
const CARD_SOLID = "#141029";

export type UiStatus = "open" | "locked" | "running" | "settled" | "preopen" | "cancelled";

export type DayInfo = {
  day_date: string;                 // 'YYYY-MM-DD'
  start_at: string | null;
  end_at: string | null;
  join_open_at: string | null;
  join_close_at: string | null;
  status?: "open" | "running" | "settled" | "cancelled" | null;
  ui_status?: UiStatus;             // if you already compute this in SQL, we use it
};

export type PickInfo = {
  hasPick: boolean;
  teamName?: string | null;
  result?: "win" | "loss" | "push" | "pending" | null;
};

export type PicksByDate = Record<string, PickInfo | undefined>;

export type EntriesModalProps = {
  visible: boolean;
  onClose: () => void;
  title: string;            // e.g., "Jupiter — $50"
  sublabel?: string;        // e.g., "September 12 – 14"
  days: DayInfo[];          // Day rows (one per tournament/day)
  picksByDate: PicksByDate; // { '2025-09-12': { hasPick:true, teamName:'Lakers', result:'pending' }, ... }
  onManagePicks: () => void;
};

function computeUiStatusForDay(d: DayInfo): UiStatus {
  if (d.ui_status) return d.ui_status;

  const now = Date.now();
  const getTs = (s: string | null) => (s ? new Date(s).getTime() : NaN);
  const start = getTs(d.start_at);
  const end = isFinite(start) ? (isFinite(getTs(d.end_at)) ? getTs(d.end_at) : start + 8 * 3600e3) : NaN;
  const open = getTs(d.join_open_at);
  const close = isFinite(start)
    ? (isFinite(getTs(d.join_close_at)) ? getTs(d.join_close_at) : start - 30 * 60e3)
    : NaN;

  if (d.status === "cancelled") return "cancelled";
  if (isFinite(end) && now >= end) return "settled";
  if (isFinite(start) && now >= start && (!isFinite(end) || now < end)) return "running";
  if (isFinite(close) && isFinite(start) && now >= close && now < start) return "locked";
  if (isFinite(open) && isFinite(close) && now >= open && now < close) return "open";
  if (isFinite(open) && now < open) return "preopen";
  return "open";
}

function labelForDay(d: DayInfo, p: PickInfo) {
  const ui = computeUiStatusForDay(d);

  if (ui === "settled" || ui === "cancelled") {
    if (p.hasPick && p.result) {
      if (p.result === "win")  return { text: "Won",  tone: "green" as const,  sub: p.teamName ?? null };
      if (p.result === "loss") return { text: "Lost", tone: "red" as const,    sub: p.teamName ?? null };
      if (p.result === "push") return { text: "Push", tone: "orange" as const, sub: p.teamName ?? null };
      return { text: "Finished — Pending Result", tone: "muted" as const, sub: p.teamName ?? null };
    }
    return { text: ui === "cancelled" ? "Cancelled" : "Finished — No Pick", tone: "muted" as const, sub: null };
  }
  if (ui === "running") {
    if (p.hasPick) return { text: "In Progress", tone: "muted" as const, sub: p.teamName ?? null };
    return { text: "In Progress — No Pick", tone: "muted" as const, sub: null };
  }
  if (ui === "locked") {
    if (p.hasPick) return { text: "Locked", tone: "muted" as const, sub: p.teamName ?? null };
    return { text: "Locked — Missed Window", tone: "muted" as const, sub: null };
  }
  if (ui === "open") {
    if (p.hasPick) return { text: "Picked", tone: "gold" as const, sub: p.teamName ?? null };
    return { text: "Make Your Selection", tone: "gold" as const, sub: null };
  }
  if (ui === "preopen") {
    if (p.hasPick) return { text: "Opens Soon", tone: "muted" as const, sub: p.teamName ?? null };
    return { text: "Opens Soon", tone: "muted" as const, sub: null };
  }
  return { text: "—", tone: "muted" as const, sub: null };
}

function textColorForTone(tone: "green" | "red" | "orange" | "gold" | "muted") {
  if (tone === "green") return "#00D181";
  if (tone === "red") return "#FF4D4F";
  if (tone === "orange") return "#FFA500";
  if (tone === "gold") return GOLD;
  return "rgba(255,255,255,0.7)";
}

function formatUsDateISO(isoDate: string) {
  try {
    const [y, m, d] = isoDate.split("-").map((x) => parseInt(x, 10));
    const dt = new Date(y, (m || 1) - 1, d || 1);
    const day = dt.toLocaleDateString("en-US", { weekday: "long" });
    const rest = dt.toLocaleDateString("en-US", { month: "short", day: "numeric" });
    return `${day}, ${rest}`;
  } catch {
    return isoDate;
  }
}

export default function EntriesModal({
  visible,
  onClose,
  title,
  sublabel,
  days,
  picksByDate,
  onManagePicks,
}: EntriesModalProps) {
  const anyOpenAndUnpicked = useMemo(
    () =>
      days.some((d) => {
        const ui = computeUiStatusForDay(d);
        const p = picksByDate[d.day_date]?.hasPick ?? false;
        return ui === "open" && !p;
      }),
    [days, picksByDate]
  );

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
      <Pressable style={styles.backdrop} onPress={onClose}>
        <Pressable style={styles.card}>
          <View style={styles.headerRow}>
            <View style={{ flex: 1 }}>
              <Text style={styles.title}>{title}</Text>
              {!!sublabel && <Text style={styles.sublabel}>{sublabel}</Text>}
            </View>
            <TouchableOpacity onPress={onClose} style={styles.closeBtn}>
              <Text style={styles.closeTxt}>✕</Text>
            </TouchableOpacity>
          </View>

          <View style={styles.daysWrap}>
            <FlatList
              data={days}
              keyExtractor={(d) => d.day_date}
              ItemSeparatorComponent={() => <View style={{ height: RFValue(10) }} />}
              renderItem={({ item }) => {
                const pick = picksByDate[item.day_date] ?? { hasPick: false };
                const label = labelForDay(item, pick);
                const color = textColorForTone(label.tone);

                return (
                  <View style={styles.dayRow}>
                    <View style={styles.dot} />
                    <View style={styles.dayContent}>
                      <Text style={styles.dayTitle}>{formatUsDateISO(item.day_date)}</Text>
                      <Text style={[styles.dayStatus, { color }]}>{label.text}</Text>
                      {!!label.sub && <Text style={styles.daySub}>{label.sub}</Text>}
                    </View>
                  </View>
                );
              }}
            />
          </View>

          <View style={styles.footerRow}>
            <TouchableOpacity
              onPress={onManagePicks}
              disabled={!anyOpenAndUnpicked}
              style={[styles.manageBtn, !anyOpenAndUnpicked && { opacity: 0.45 }]}
            >
              <Text style={styles.manageTxt}>Manage Picks</Text>
            </TouchableOpacity>
            <TouchableOpacity onPress={onClose} style={styles.closeBtn2}>
              <Text style={styles.closeTxt2}>Close</Text>
            </TouchableOpacity>
          </View>
        </Pressable>
      </Pressable>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.55)",
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: RFValue(16),
  },
  card: {
    width: "100%",
    borderRadius: RFValue(16),
    backgroundColor: CARD_SOLID,
    borderWidth: 1,
    borderColor: BORDER,
    padding: RFValue(14),
  },
  headerRow: {
    flexDirection: "row",
    alignItems: "center",
    marginBottom: RFValue(8),
  },
  title: {
    color: "#fff",
    fontSize: RFValue(16),
    fontWeight: Platform.select({ ios: "600", android: "700", default: "600" }),
  },
  sublabel: {
    color: "rgba(255,255,255,0.65)",
    fontSize: RFValue(12),
    marginTop: RFValue(2),
  },
  closeBtn: {
    width: RFValue(28),
    height: RFValue(28),
    borderRadius: RFValue(8),
    backgroundColor: "rgba(255,255,255,0.08)",
    alignItems: "center",
    justifyContent: "center",
    marginLeft: RFValue(8),
  },
  closeTxt: {
    color: "#fff",
    fontSize: RFValue(14),
    top: Platform.select({ ios: -1, android: 0, default: 0 }),
  },
  daysWrap: {
    marginTop: RFValue(10),
    paddingVertical: RFValue(4),
  },
  dayRow: {
    flexDirection: "row",
    backgroundColor: "rgba(255,255,255,0.04)",
    borderWidth: 1,
    borderColor: DIV,
    borderRadius: RFValue(12),
    paddingVertical: RFValue(10),
    paddingHorizontal: RFValue(12),
  },
  dot: {
    width: RFValue(8),
    height: RFValue(8),
    borderRadius: RFValue(8),
    backgroundColor: GOLD,
    marginTop: RFValue(6),
    marginRight: RFValue(10),
  },
  dayContent: {
    flex: 1,
  },
  dayTitle: {
    color: "rgba(255,255,255,0.85)",
    fontSize: RFValue(12),
    marginBottom: RFValue(2),
  },
  dayStatus: {
    fontSize: RFValue(13),
    fontWeight: Platform.select({ ios: "600", android: "700", default: "600" }),
  },
  daySub: {
    color: "rgba(255,255,255,0.65)",
    fontSize: RFValue(12),
    marginTop: RFValue(2),
  },
  footerRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: RFValue(10),
    marginTop: RFValue(16),
  },
  manageBtn: {
    flex: 1,
    backgroundColor: PURPLE,
    borderRadius: RFValue(12),
    paddingVertical: RFValue(12),
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.10)",
  },
  manageTxt: {
    color: "#fff",
    fontSize: RFValue(14),
    fontWeight: Platform.select({ ios: "700", android: "700", default: "700" }),
    letterSpacing: 0.3,
  },
  closeBtn2: {
    width: RFValue(92),
    backgroundColor: "rgba(255,255,255,0.08)",
    borderRadius: RFValue(12),
    alignItems: "center",
    justifyContent: "center",
    paddingVertical: RFValue(12),
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.10)",
  },
  closeTxt2: {
    color: "#fff",
    fontSize: RFValue(14),
    fontWeight: "600",
  },
});
