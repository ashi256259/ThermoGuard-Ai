import crypto from "crypto";

export interface UserRecord {
  id: string;
  username: string;
  email: string;
  name: string;
  role: "ADMIN" | "CHIEF_SURVEILLANCE_OFFICER" | "SENIOR_GIS_ANALYST" | "ANALYST" | "FIELD_OPERATIONS_OFFICER" | "OPERATOR";
  organisation: string;
  department: string;
  badge_number: string;
  clearance_level: string;
  password_hash: string;
  salt: string;
  created_at: string;
  last_login?: string;
}

export interface SessionRecord {
  token: string;
  user_id: string;
  username: string;
  email: string;
  name: string;
  role: string;
  clearance_level: string;
  created_at: string;
  expires_at: string;
}

// Cryptographic Password Hashing using scrypt
export function hashPassword(password: string, salt?: string): { hash: string; salt: string } {
  const actualSalt = salt || crypto.randomBytes(16).toString("hex");
  const derivedKey = crypto.scryptSync(password, actualSalt, 64);
  return {
    hash: derivedKey.toString("hex"),
    salt: actualSalt
  };
}

export function verifyPassword(password: string, storedHash: string, salt: string): boolean {
  try {
    const derivedKey = crypto.scryptSync(password, salt, 64);
    const keyBuffer = Buffer.from(derivedKey.toString("hex"), "hex");
    const storedBuffer = Buffer.from(storedHash, "hex");
    if (keyBuffer.length !== storedBuffer.length) {
      return false;
    }
    return crypto.timingSafeEqual(keyBuffer, storedBuffer);
  } catch (err) {
    return false;
  }
}

export function generateSessionToken(): string {
  return "tg_" + crypto.randomBytes(32).toString("hex");
}

// In-Memory User Store initialized with verified officer accounts
const initialSeedUsers: Array<{
  id: string;
  username: string;
  email: string;
  name: string;
  role: UserRecord["role"];
  clearance_level: string;
  badge_number: string;
  defaultPass: string;
}> = [
  {
    id: "usr-ntro-001",
    username: "ntro.officer",
    email: "officer@thermoguard.gov.in",
    name: "Dr. Vikram Sethi",
    role: "CHIEF_SURVEILLANCE_OFFICER",
    clearance_level: "LEVEL_4_RESTRICTED",
    badge_number: "NTRO-TSW-8812",
    defaultPass: "Analyst@2026!"
  },
  {
    id: "usr-ntro-002",
    username: "gis.analyst",
    email: "analyst.gis@thermoguard.gov.in",
    name: "Pooja Sharma",
    role: "SENIOR_GIS_ANALYST",
    clearance_level: "LEVEL_3_CONFIDENTIAL",
    badge_number: "NTRO-GEO-4421",
    defaultPass: "Thermal#Secure2026"
  },
  {
    id: "usr-ntro-005",
    username: "analyst.user",
    email: "analyst@thermoguard.gov.in",
    name: "Aditi Roy",
    role: "ANALYST",
    clearance_level: "LEVEL_2_RESTRICTED",
    badge_number: "NTRO-GEO-7104",
    defaultPass: "Analyst#2026"
  },
  {
    id: "usr-ntro-003",
    username: "field.ops",
    email: "field.dispatch@thermoguard.gov.in",
    name: "Captain Rajesh Verma",
    role: "FIELD_OPERATIONS_OFFICER",
    clearance_level: "LEVEL_3_CONFIDENTIAL",
    badge_number: "NDMA-FOP-1903",
    defaultPass: "Dispatch@2026"
  },
  {
    id: "usr-ntro-004",
    username: "admin",
    email: "admin@thermoguard.gov.in",
    name: "System Administrator",
    role: "ADMIN",
    clearance_level: "LEVEL_4_RESTRICTED",
    badge_number: "NTRO-SYS-0001",
    defaultPass: "Admin@NTRO2026"
  }
];

class AuthManager {
  private users: Map<string, UserRecord> = new Map();
  private sessions: Map<string, SessionRecord> = new Map();

  constructor() {
    this.seedUsers();
  }

  private seedUsers() {
    for (const u of initialSeedUsers) {
      const { hash, salt } = hashPassword(u.defaultPass);
      const userRec: UserRecord = {
        id: u.id,
        username: u.username.toLowerCase(),
        email: u.email.toLowerCase(),
        name: u.name,
        role: u.role,
        organisation: "National Technical Research Organisation (NTRO)",
        department: "Thermal & Geospatial Intelligence Wing",
        badge_number: u.badge_number,
        clearance_level: u.clearance_level,
        password_hash: hash,
        salt,
        created_at: new Date().toISOString()
      };
      this.users.set(userRec.id, userRec);
    }
  }

  public getAllUsers(): Array<Omit<UserRecord, "password_hash" | "salt"> & { active_sessions_count: number }> {
    const list: Array<Omit<UserRecord, "password_hash" | "salt"> & { active_sessions_count: number }> = [];
    for (const user of this.users.values()) {
      const { password_hash, salt, ...safeUser } = user;
      let sessionCount = 0;
      for (const s of this.sessions.values()) {
        if (s.user_id === user.id) sessionCount++;
      }
      list.push({
        ...safeUser,
        active_sessions_count: sessionCount
      });
    }
    return list;
  }

  public updateUserRole(userId: string, newRole: UserRecord["role"], newClearance?: string): Omit<UserRecord, "password_hash" | "salt"> {
    const user = this.users.get(userId);
    if (!user) {
      throw new Error(`User with ID ${userId} not found.`);
    }

    user.role = newRole;
    if (newClearance) {
      user.clearance_level = newClearance;
    } else {
      if (newRole === "ADMIN" || newRole === "CHIEF_SURVEILLANCE_OFFICER") {
        user.clearance_level = "LEVEL_4_RESTRICTED";
      } else if (newRole === "SENIOR_GIS_ANALYST" || newRole === "FIELD_OPERATIONS_OFFICER") {
        user.clearance_level = "LEVEL_3_CONFIDENTIAL";
      } else {
        user.clearance_level = "LEVEL_2_RESTRICTED";
      }
    }

    this.users.set(user.id, user);

    // Update active sessions for this user
    for (const session of this.sessions.values()) {
      if (session.user_id === user.id) {
        session.role = user.role;
        session.clearance_level = user.clearance_level;
      }
    }

    const { password_hash, salt, ...safeUser } = user;
    return safeUser;
  }

  public deleteUser(userId: string): boolean {
    if (userId === "usr-ntro-004" || userId === "usr-ntro-001") {
      throw new Error("Cannot delete primary system administrator or commanding officer accounts.");
    }
    const user = this.users.get(userId);
    if (!user) {
      throw new Error("User not found.");
    }

    // Terminate user sessions
    for (const [token, session] of this.sessions.entries()) {
      if (session.user_id === userId) {
        this.sessions.delete(token);
      }
    }

    return this.users.delete(userId);
  }

  public getAllSessions(): SessionRecord[] {
    const now = Date.now();
    const active: SessionRecord[] = [];
    for (const [token, s] of this.sessions.entries()) {
      if (new Date(s.expires_at).getTime() < now) {
        this.sessions.delete(token);
      } else {
        active.push(s);
      }
    }
    return active;
  }

  public findByEmailOrUsername(identifier: string): UserRecord | undefined {
    const clean = identifier.trim().toLowerCase();
    for (const u of this.users.values()) {
      if (u.email === clean || u.username === clean) {
        return u;
      }
    }
    return undefined;
  }

  public findById(id: string): UserRecord | undefined {
    return this.users.get(id);
  }

  public registerUser(params: {
    username: string;
    email: string;
    name: string;
    password: string;
    role?: UserRecord["role"];
    department?: string;
  }): { user: Omit<UserRecord, "password_hash" | "salt">; token: string } {
    const existing = this.findByEmailOrUsername(params.username) || this.findByEmailOrUsername(params.email);
    if (existing) {
      throw new Error("A user with this username or official email already exists.");
    }

    if (!params.password || params.password.length < 6) {
      throw new Error("Password must be at least 6 characters long.");
    }

    const { hash, salt } = hashPassword(params.password);
    const userId = "usr-ntro-" + crypto.randomBytes(4).toString("hex");
    const role = params.role || "SENIOR_GIS_ANALYST";
    const badgeNum = "NTRO-" + Math.floor(1000 + Math.random() * 9000);

    let clearance = "LEVEL_2_RESTRICTED";
    if (role === "CHIEF_SURVEILLANCE_OFFICER") {
      clearance = "LEVEL_4_RESTRICTED";
    } else if (role === "SENIOR_GIS_ANALYST" || role === "FIELD_OPERATIONS_OFFICER") {
      clearance = "LEVEL_3_CONFIDENTIAL";
    }

    const userRec: UserRecord = {
      id: userId,
      username: params.username.trim().toLowerCase(),
      email: params.email.trim().toLowerCase(),
      name: params.name.trim(),
      role,
      organisation: "National Technical Research Organisation (NTRO)",
      department: params.department || "Thermal & Geospatial Intelligence Wing",
      badge_number: badgeNum,
      clearance_level: clearance,
      password_hash: hash,
      salt,
      created_at: new Date().toISOString()
    };

    this.users.set(userRec.id, userRec);
    const session = this.createSession(userRec);

    const { password_hash, salt: _s, ...safeUser } = userRec;
    return {
      user: safeUser,
      token: session.token
    };
  }

  public authenticate(identifier: string, password: string): { user: Omit<UserRecord, "password_hash" | "salt">; token: string } {
    const user = this.findByEmailOrUsername(identifier);
    if (!user) {
      throw new Error("Invalid username/email or password credentials.");
    }

    const isValid = verifyPassword(password, user.password_hash, user.salt);
    if (!isValid) {
      throw new Error("Invalid username/email or password credentials.");
    }

    // Update last login
    user.last_login = new Date().toISOString();
    this.users.set(user.id, user);

    const session = this.createSession(user);
    const { password_hash, salt, ...safeUser } = user;

    return {
      user: safeUser,
      token: session.token
    };
  }

  public createSession(user: UserRecord): SessionRecord {
    const token = generateSessionToken();
    const now = new Date();
    // 24-hour expiration
    const expiresAt = new Date(now.getTime() + 24 * 60 * 60 * 1000).toISOString();

    const session: SessionRecord = {
      token,
      user_id: user.id,
      username: user.username,
      email: user.email,
      name: user.name,
      role: user.role,
      clearance_level: user.clearance_level,
      created_at: now.toISOString(),
      expires_at: expiresAt
    };

    this.sessions.set(token, session);
    return session;
  }

  public validateSession(token: string): { user: Omit<UserRecord, "password_hash" | "salt">; session: SessionRecord } | null {
    if (!token || !token.startsWith("tg_")) {
      return null;
    }

    const session = this.sessions.get(token);
    if (!session) {
      return null;
    }

    // Check expiration
    if (new Date(session.expires_at).getTime() < Date.now()) {
      this.sessions.delete(token);
      return null;
    }

    const user = this.users.get(session.user_id);
    if (!user) {
      this.sessions.delete(token);
      return null;
    }

    const { password_hash, salt, ...safeUser } = user;
    return { user: safeUser, session };
  }

  public invalidateSession(token: string): boolean {
    return this.sessions.delete(token);
  }

  public getDemoIdentities(): Array<{
    name: string;
    username: string;
    email: string;
    role: string;
    clearance_level: string;
    description: string;
  }> {
    return [
      {
        name: "System Administrator",
        username: "admin",
        email: "admin@thermoguard.gov.in",
        role: "System Administrator / Authority",
        clearance_level: "Level 4 (Restricted)",
        description: "Full system administration, user/role management, provider controls & alert resolution"
      },
      {
        name: "Dr. Vikram Sethi",
        username: "ntro.officer",
        email: "officer@thermoguard.gov.in",
        role: "Chief Surveillance Officer",
        clearance_level: "Level 4 (Restricted)",
        description: "Full command authority, priority disaster dispatch & model telemetry"
      },
      {
        name: "Pooja Sharma",
        username: "gis.analyst",
        email: "analyst.gis@thermoguard.gov.in",
        role: "Senior GIS Analyst",
        clearance_level: "Level 3 (Confidential)",
        description: "Thermal hotspot cataloging, spatial attribution & temporal audit"
      },
      {
        name: "Aditi Roy",
        username: "analyst.user",
        email: "analyst@thermoguard.gov.in",
        role: "GIS Intelligence Analyst",
        clearance_level: "Level 2 (Restricted)",
        description: "Surveillance exploration, source telemetry, ML inference & temporal analysis"
      },
      {
        name: "Captain Rajesh Verma",
        username: "field.ops",
        email: "field.dispatch@thermoguard.gov.in",
        role: "Field Operations Officer",
        clearance_level: "Level 3 (Confidential)",
        description: "Incident hazard acknowledgment, emergency triage & field response"
      }
    ];
  }
}

export function isAdminRole(role: string): boolean {
  return role === "ADMIN" || role === "CHIEF_SURVEILLANCE_OFFICER" || role === "admin";
}

export function isOfficerRole(role: string): boolean {
  return role === "CHIEF_SURVEILLANCE_OFFICER" || role === "admin" || role === "ADMIN";
}

export function isAnalystRole(role: string): boolean {
  return role === "ANALYST" || role === "SENIOR_GIS_ANALYST" || role === "OPERATOR" || isOfficerRole(role);
}

export function canManageProviderSettings(role: string): boolean {
  return isAdminRole(role);
}

export function canManageAlerts(role: string): boolean {
  return isAdminRole(role) || role === "FIELD_OPERATIONS_OFFICER";
}

export function canVerifyClassification(role: string): boolean {
  // GIS/intelligence analyst roles and authority/admin roles can verify/reclassify.
  // Field operations officers read verification results but cannot change them.
  return isAnalystRole(role) || isAdminRole(role);
}

export function canAccessAdminConsole(role: string): boolean {
  return isAdminRole(role);
}

export const authManager = new AuthManager();
