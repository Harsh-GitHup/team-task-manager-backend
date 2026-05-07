const fetch = globalThis.fetch || require("node-fetch");
const base = process.env.BASE || "http://localhost:5000";

async function req(path, opts = {}) {
    console.log(`[req] Starting fetch to ${path}`);
    try {
        const res = await fetch(base + path, opts);
        const text = await res.text();
        let data = null;
        try {
            data = JSON.parse(text);
        } catch (parseErr) {
            console.debug(`[req] Non-JSON response from ${path}: ${parseErr.message}`);
            data = text;
        }
        console.log(`[req] ${path} -> ${res.status}`);
        return { status: res.status, data };
    } catch (err) {
        console.error(`[req] Error on ${path}:`, err);
        throw err;
    }
}

async function login(email, password) {
    const r = await req("/auth/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email, password }),
    });
    if (r.status !== 200) throw new Error("Login failed");
    return r.data;
}

async function createInvite(adminToken, email) {
    const r = await req("/invites", {
        method: "POST",
        headers: { Authorization: "Bearer " + adminToken, "Content-Type": "application/json" },
        body: JSON.stringify({ email }),
    });
    if (r.status !== 200) throw new Error("Invite creation failed");
    return r.data.token;
}

async function signupMember(name, email, password, inviteToken) {
    const r = await req("/auth/signup", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name, email, password, invite_token: inviteToken }),
    });
    if (![201, 200].includes(r.status)) throw new Error("Signup failed: " + JSON.stringify(r.data));
    return r.data;
}

async function createTeamAsAdmin(adminToken, teamName) {
    const r = await req("/teams", {
        method: "POST",
        headers: { Authorization: "Bearer " + adminToken, "Content-Type": "application/json" },
        body: JSON.stringify({ name: teamName }),
    });
    if (r.status !== 201) throw new Error("Team creation failed");
    return r.data.id;
}

async function addMemberToTeam(adminToken, teamId, userId) {
    const r = await req("/teams/add-member", {
        method: "POST",
        headers: { Authorization: "Bearer " + adminToken, "Content-Type": "application/json" },
        body: JSON.stringify({ team_id: teamId, user_id: userId }),
    });
    if (r.status !== 200) throw new Error("Add member failed");
}

async function setTeamHead(adminToken, teamId, userId) {
    const r = await req("/teams/set-head", {
        method: "POST",
        headers: { Authorization: "Bearer " + adminToken, "Content-Type": "application/json" },
        body: JSON.stringify({ team_id: teamId, user_id: userId }),
    });
    if (r.status !== 200) throw new Error("Set head failed");
}

async function createProjectAsHead(token, title, desc, teamId) {
    const r = await req("/projects", {
        method: "POST",
        headers: { Authorization: "Bearer " + token, "Content-Type": "application/json" },
        body: JSON.stringify({ title, description: desc, team_id: teamId }),
    });
    if (r.status !== 201) throw new Error("Project creation failed");
    return r.data.id;
}

async function createTaskAsHead(token, title, teamId, projectId, assignedTo) {
    const r = await req("/tasks", {
        method: "POST",
        headers: { Authorization: "Bearer " + token, "Content-Type": "application/json" },
        body: JSON.stringify({ title, team_id: teamId, project_id: projectId, assigned_to: assignedTo }),
    });
    if (r.status !== 201) throw new Error("Task creation failed");
    return r.data.id;
}

(async function run() {
    try {
        console.log("Starting admin E2E flow against", base);

        const admin = await login("admin@team.com", "password");
        const adminToken = admin.token;
        console.log("Admin logged in. id=", admin.user?.id);

        const timestamp = Date.now();
        const memberEmail = `e2e_member_${timestamp}@local`;

        const inviteToken = await createInvite(adminToken, memberEmail);
        console.log("Invite token created");

        await signupMember("E2E Member", memberEmail, "password", inviteToken);
        console.log("Member signup ok");

        const usersResp = await req("/auth/users", { headers: { Authorization: "Bearer " + adminToken } });
        if (usersResp.status !== 200) throw new Error("Could not fetch users");
        const users = usersResp.data;
        const member = users.find((u) => u.email === memberEmail);
        if (!member) throw new Error("Member not found in users list");
        console.log("Found member id=", member.id);

        const teamId = await createTeamAsAdmin(adminToken, "E2E Team");
        console.log("Created team id=", teamId);

        await addMemberToTeam(adminToken, teamId, member.id);
        console.log("Member added to team");

        await setTeamHead(adminToken, teamId, member.id);
        console.log("Team head assigned");

        const headLogin = await login(member.email, "password");
        const headToken = headLogin.token;
        console.log("Member logged in as head id=", headLogin.user?.id);

        const projectId = await createProjectAsHead(headToken, "E2E Project", "Created by head", teamId);
        console.log("Project created id=", projectId);

        const taskId = await createTaskAsHead(headToken, "E2E Task", teamId, projectId, member.id);
        console.log("Task created id=", taskId);

        const tasksResp = await req("/tasks", { headers: { Authorization: "Bearer " + headToken } });
        if (tasksResp.status !== 200) throw new Error("Fetch tasks failed");
        console.log("Member tasks count=", (tasksResp.data || []).length);

        console.log("E2E flow completed successfully");
        process.exit(0);
    } catch (err) {
        console.error("E2E flow failed:", err);
        process.exit(1);
    }
})();
