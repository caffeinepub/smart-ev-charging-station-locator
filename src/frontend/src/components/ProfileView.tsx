import {
  Bike,
  Car,
  ChevronLeft,
  Edit2,
  Save,
  Truck,
  User,
  X,
} from "lucide-react";
import type React from "react";
import { useEffect, useState } from "react";

const IOS = {
  blue: "#007AFF",
  label: "#1c1c1e",
  secondaryLabel: "#6c6c70",
  background: "#f2f2f7",
  groupedBg: "#ffffff",
  separator: "rgba(60,60,67,0.12)",
};

const EV_MODELS_BY_TYPE: Record<string, string[]> = {
  bike: [
    "Ather 450X",
    "Ather 450 Plus",
    "Ola S1 Pro",
    "Ola S1 Air",
    "Bajaj Chetak",
    "TVS iQube S",
    "Hero Vida V1 Pro",
    "Simple One",
    "Revolt RV400",
    "Tork Kratos R",
  ],
  car: [
    "Tata Nexon EV",
    "Tata Tiago EV",
    "Tata Tigor EV",
    "MG ZS EV",
    "Hyundai Kona Electric",
    "Kia EV6",
    "BYD Atto 3",
    "Volvo XC40 Recharge",
    "BMW iX",
    "Mercedes EQS",
    "Mahindra XUV400",
    "MG Comet EV",
  ],
  other: [
    "Tata Ace EV",
    "Mahindra Treo",
    "Piaggio Ape E-City",
    "Hero Electric Optima",
    "Custom / Other",
  ],
};

interface ProfileData {
  name: string;
  phone: string;
  vehicleType: "bike" | "car" | "other";
  vehicleModel: string;
  vehiclePlate: string;
  batteryCapacity: string;
}

const STORAGE_KEY = "ev_user_profile";

function loadProfile(): ProfileData {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) return JSON.parse(raw) as ProfileData;
  } catch {}
  return {
    name: "",
    phone: "",
    vehicleType: "car",
    vehicleModel: "",
    vehiclePlate: "",
    batteryCapacity: "",
  };
}

function saveProfile(p: ProfileData) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(p));
}

interface Props {
  onClose: () => void;
  principalId?: string;
}

export default function ProfileView({ onClose, principalId }: Props) {
  const [profile, setProfile] = useState<ProfileData>(loadProfile);
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState<ProfileData>(profile);
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    setDraft(profile);
  }, [profile]);

  const vehicleIcon =
    draft.vehicleType === "bike" ? (
      <Bike size={18} color={IOS.blue} />
    ) : draft.vehicleType === "car" ? (
      <Car size={18} color={IOS.blue} />
    ) : (
      <Truck size={18} color={IOS.blue} />
    );

  const handleSave = () => {
    saveProfile(draft);
    setProfile(draft);
    setEditing(false);
    setSaved(true);
    setTimeout(() => setSaved(false), 2000);
  };

  const handleCancel = () => {
    setDraft(profile);
    setEditing(false);
  };

  const models = EV_MODELS_BY_TYPE[draft.vehicleType] || [];

  const Row = ({
    label,
    value,
    children,
  }: {
    label: string;
    value?: string;
    children?: React.ReactNode;
  }) => (
    <div
      style={{
        display: "flex",
        flexDirection: "column",
        padding: "12px 16px",
        borderBottom: `1px solid ${IOS.separator}`,
      }}
    >
      <span
        style={{
          fontSize: 12,
          color: IOS.secondaryLabel,
          marginBottom: 4,
          textTransform: "uppercase",
          letterSpacing: 0.4,
          fontWeight: 500,
        }}
      >
        {label}
      </span>
      {children ?? (
        <span style={{ fontSize: 15, color: IOS.label }}>
          {value || <span style={{ color: IOS.secondaryLabel }}>Not set</span>}
        </span>
      )}
    </div>
  );

  const inputStyle: React.CSSProperties = {
    fontSize: 15,
    color: IOS.label,
    border: `1px solid ${IOS.blue}`,
    borderRadius: 8,
    padding: "6px 10px",
    outline: "none",
    width: "100%",
    background: "#fff",
    boxSizing: "border-box",
  };

  return (
    <div
      data-ocid="profile.panel"
      style={{
        position: "fixed",
        inset: 0,
        background: IOS.background,
        zIndex: 9000,
        display: "flex",
        flexDirection: "column",
        fontFamily:
          "-apple-system, BlinkMacSystemFont, 'SF Pro Display', 'Segoe UI', sans-serif",
        overflowY: "auto",
      }}
    >
      {/* Header */}
      <div
        style={{
          background: "rgba(242,242,247,0.92)",
          backdropFilter: "blur(20px)",
          WebkitBackdropFilter: "blur(20px)",
          borderBottom: `1px solid ${IOS.separator}`,
          padding: "env(safe-area-inset-top, 44px) 16px 0",
          position: "sticky",
          top: 0,
          zIndex: 10,
        }}
      >
        <div
          style={{
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            paddingBottom: 12,
            minHeight: 44,
          }}
        >
          <button
            data-ocid="profile.back.button"
            type="button"
            onClick={onClose}
            style={{
              background: "none",
              border: "none",
              cursor: "pointer",
              color: IOS.blue,
              fontSize: 15,
              display: "flex",
              alignItems: "center",
              gap: 2,
              padding: "4px 0",
            }}
          >
            <ChevronLeft size={20} color={IOS.blue} />
            Back
          </button>
          <span style={{ fontSize: 17, fontWeight: 600, color: IOS.label }}>
            My Profile
          </span>
          {editing ? (
            <div style={{ display: "flex", gap: 8 }}>
              <button
                data-ocid="profile.cancel.button"
                type="button"
                onClick={handleCancel}
                style={{
                  background: "none",
                  border: "none",
                  cursor: "pointer",
                  color: "#ff3b30",
                  fontSize: 15,
                  display: "flex",
                  alignItems: "center",
                  gap: 4,
                }}
              >
                <X size={16} /> Cancel
              </button>
              <button
                data-ocid="profile.save.button"
                type="button"
                onClick={handleSave}
                style={{
                  background: IOS.blue,
                  border: "none",
                  cursor: "pointer",
                  color: "#fff",
                  fontSize: 15,
                  display: "flex",
                  alignItems: "center",
                  gap: 4,
                  padding: "6px 12px",
                  borderRadius: 8,
                }}
              >
                <Save size={15} /> Save
              </button>
            </div>
          ) : (
            <button
              data-ocid="profile.edit.button"
              type="button"
              onClick={() => setEditing(true)}
              style={{
                background: "none",
                border: "none",
                cursor: "pointer",
                color: IOS.blue,
                fontSize: 15,
                display: "flex",
                alignItems: "center",
                gap: 4,
              }}
            >
              <Edit2 size={15} /> Edit
            </button>
          )}
        </div>
      </div>

      {/* Avatar */}
      <div
        style={{
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          padding: "24px 16px 16px",
          gap: 8,
        }}
      >
        <div
          style={{
            width: 80,
            height: 80,
            borderRadius: 40,
            background: IOS.blue,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            boxShadow: "0 4px 16px rgba(0,122,255,0.3)",
          }}
        >
          <User size={40} color="#fff" />
        </div>
        <span style={{ fontSize: 22, fontWeight: 700, color: IOS.label }}>
          {profile.name || "Your Name"}
        </span>
        {principalId && (
          <span
            style={{
              fontSize: 11,
              color: IOS.secondaryLabel,
              fontFamily: "monospace",
              background: "rgba(0,0,0,0.05)",
              padding: "2px 8px",
              borderRadius: 6,
              maxWidth: 280,
              overflow: "hidden",
              textOverflow: "ellipsis",
              whiteSpace: "nowrap",
            }}
          >
            {principalId}
          </span>
        )}
        {saved && (
          <span
            data-ocid="profile.success_state"
            style={{
              fontSize: 13,
              color: "#34c759",
              background: "rgba(52,199,89,0.1)",
              padding: "4px 12px",
              borderRadius: 12,
              fontWeight: 500,
            }}
          >
            Profile saved!
          </span>
        )}
      </div>

      {/* Personal Info */}
      <div style={{ padding: "0 16px 8px" }}>
        <span
          style={{
            fontSize: 12,
            color: IOS.secondaryLabel,
            textTransform: "uppercase",
            letterSpacing: 0.5,
            fontWeight: 600,
            paddingLeft: 4,
          }}
        >
          Personal Info
        </span>
      </div>
      <div
        style={{
          margin: "0 16px",
          background: IOS.groupedBg,
          borderRadius: 12,
          overflow: "hidden",
          boxShadow: "0 1px 3px rgba(0,0,0,0.07)",
          marginBottom: 20,
        }}
      >
        <Row label="Full Name">
          {editing ? (
            <input
              data-ocid="profile.name.input"
              style={inputStyle}
              value={draft.name}
              onChange={(e) => setDraft({ ...draft, name: e.target.value })}
              placeholder="Enter your name"
            />
          ) : (
            <span style={{ fontSize: 15, color: IOS.label }}>
              {profile.name || (
                <span style={{ color: IOS.secondaryLabel }}>Not set</span>
              )}
            </span>
          )}
        </Row>
        <Row label="Phone">
          {editing ? (
            <input
              data-ocid="profile.phone.input"
              style={inputStyle}
              type="tel"
              value={draft.phone}
              onChange={(e) => setDraft({ ...draft, phone: e.target.value })}
              placeholder="+91 00000 00000"
            />
          ) : (
            <span style={{ fontSize: 15, color: IOS.label }}>
              {profile.phone || (
                <span style={{ color: IOS.secondaryLabel }}>Not set</span>
              )}
            </span>
          )}
        </Row>
      </div>

      {/* Vehicle Info */}
      <div style={{ padding: "0 16px 8px" }}>
        <span
          style={{
            fontSize: 12,
            color: IOS.secondaryLabel,
            textTransform: "uppercase",
            letterSpacing: 0.5,
            fontWeight: 600,
            paddingLeft: 4,
          }}
        >
          Vehicle Info
        </span>
      </div>
      <div
        style={{
          margin: "0 16px",
          background: IOS.groupedBg,
          borderRadius: 12,
          overflow: "hidden",
          boxShadow: "0 1px 3px rgba(0,0,0,0.07)",
          marginBottom: 20,
        }}
      >
        <Row label="Vehicle Type">
          {editing ? (
            <div style={{ display: "flex", gap: 8, marginTop: 4 }}>
              {(["bike", "car", "other"] as const).map((t) => (
                <button
                  data-ocid={`profile.vehicle_type.${t}`}
                  key={t}
                  type="button"
                  onClick={() =>
                    setDraft({ ...draft, vehicleType: t, vehicleModel: "" })
                  }
                  style={{
                    flex: 1,
                    padding: "8px 4px",
                    borderRadius: 8,
                    border: `1.5px solid ${
                      draft.vehicleType === t ? IOS.blue : IOS.separator
                    }`,
                    background:
                      draft.vehicleType === t
                        ? "rgba(0,122,255,0.1)"
                        : "transparent",
                    color:
                      draft.vehicleType === t ? IOS.blue : IOS.secondaryLabel,
                    cursor: "pointer",
                    fontSize: 13,
                    fontWeight: draft.vehicleType === t ? 600 : 400,
                    display: "flex",
                    flexDirection: "column",
                    alignItems: "center",
                    gap: 4,
                  }}
                >
                  {t === "bike" ? (
                    <Bike size={16} />
                  ) : t === "car" ? (
                    <Car size={16} />
                  ) : (
                    <Truck size={16} />
                  )}
                  {t === "other"
                    ? "Other"
                    : t.charAt(0).toUpperCase() + t.slice(1)}
                </button>
              ))}
            </div>
          ) : (
            <div
              style={{
                display: "flex",
                alignItems: "center",
                gap: 6,
                fontSize: 15,
                color: IOS.label,
              }}
            >
              {vehicleIcon}
              {profile.vehicleType.charAt(0).toUpperCase() +
                profile.vehicleType.slice(1)}
            </div>
          )}
        </Row>

        <Row label="Vehicle Model">
          {editing ? (
            <select
              data-ocid="profile.vehicle_model.select"
              style={{ ...inputStyle }}
              value={draft.vehicleModel}
              onChange={(e) =>
                setDraft({ ...draft, vehicleModel: e.target.value })
              }
            >
              <option value="">Select model</option>
              {models.map((m) => (
                <option key={m} value={m}>
                  {m}
                </option>
              ))}
              <option value="__custom">Other / Custom</option>
            </select>
          ) : (
            <span style={{ fontSize: 15, color: IOS.label }}>
              {profile.vehicleModel || (
                <span style={{ color: IOS.secondaryLabel }}>Not set</span>
              )}
            </span>
          )}
        </Row>

        <Row label="Number Plate">
          {editing ? (
            <input
              data-ocid="profile.plate.input"
              style={inputStyle}
              value={draft.vehiclePlate}
              onChange={(e) =>
                setDraft({
                  ...draft,
                  vehiclePlate: e.target.value.toUpperCase(),
                })
              }
              placeholder="KA 26 AB 1234"
              maxLength={12}
            />
          ) : (
            <span style={{ fontSize: 15, color: IOS.label }}>
              {profile.vehiclePlate || (
                <span style={{ color: IOS.secondaryLabel }}>Not set</span>
              )}
            </span>
          )}
        </Row>

        <Row label="Battery Capacity (kWh)">
          {editing ? (
            <input
              data-ocid="profile.battery.input"
              style={inputStyle}
              type="number"
              value={draft.batteryCapacity}
              onChange={(e) =>
                setDraft({ ...draft, batteryCapacity: e.target.value })
              }
              placeholder="e.g. 40"
            />
          ) : (
            <span style={{ fontSize: 15, color: IOS.label }}>
              {profile.batteryCapacity ? (
                `${profile.batteryCapacity} kWh`
              ) : (
                <span style={{ color: IOS.secondaryLabel }}>Not set</span>
              )}
            </span>
          )}
        </Row>
      </div>

      {/* Bottom padding for safe area */}
      <div style={{ height: "env(safe-area-inset-bottom, 24px)" }} />
    </div>
  );
}
