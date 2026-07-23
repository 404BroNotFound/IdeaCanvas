"use strict";

(function createIdeaCanvasCloud(global) {
  const config = global.IDEACANVAS_SUPABASE || {};
  const configured = Boolean(config.url && config.publishableKey);
  let client = null;
  let user = null;
  let lastAuthEvent = null;
  const listeners = new Set();

  function emit() {
    listeners.forEach((listener) => listener(user));
  }

  async function init() {
    if (!configured) return null;
    if (!global.supabase?.createClient) throw new Error("Supabase client could not be loaded");
    client = global.supabase.createClient(config.url, config.publishableKey, {
      auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: true },
    });
    const { data, error } = await client.auth.getSession();
    if (error) throw error;
    user = data.session?.user || null;
    client.auth.onAuthStateChange((event, session) => {
      lastAuthEvent = event;
      user = session?.user || null;
      emit();
    });
    emit();
    return user;
  }

  async function signIn(email, password) {
    if (!client) throw new Error("Cloud storage is not configured");
    const { data, error } = await client.auth.signInWithPassword({ email, password });
    if (error) throw error;
    user = data.user;
    emit();
    return user;
  }

  async function signUp(email, password) {
    if (!client) throw new Error("Cloud storage is not configured");
    const canRedirect = /^https?:$/.test(global.location?.protocol || "");
    const emailRedirectTo = canRedirect ? new URL(".", global.location.href).href : undefined;
    const { data, error } = await client.auth.signUp({
      email,
      password,
      options: emailRedirectTo ? { emailRedirectTo } : undefined,
    });
    if (error) throw error;
    const accountUser = data.user;
    user = data.session?.user || null;
    emit();
    return { user: accountUser, needsConfirmation: !data.session };
  }

  async function signOut() {
    if (!client) return;
    const { error } = await client.auth.signOut();
    if (error) throw error;
    user = null;
    emit();
  }

  async function resendConfirmation(email) {
    if (!client) throw new Error("Cloud storage is not configured");
    const canRedirect = /^https?:$/.test(global.location?.protocol || "");
    const emailRedirectTo = canRedirect ? new URL(".", global.location.href).href : undefined;
    const { error } = await client.auth.resend({
      type: "signup",
      email,
      options: emailRedirectTo ? { emailRedirectTo } : undefined,
    });
    if (error) throw error;
  }
  async function requestPasswordReset(email) {
    if (!client) throw new Error("Cloud storage is not configured");
    const canRedirect = /^https?:$/.test(global.location?.protocol || "");
    const redirectTo = canRedirect ? new URL(".", global.location.href).href : undefined;
    const { error } = await client.auth.resetPasswordForEmail(email, { redirectTo });
    if (error) throw error;
  }

  async function updatePassword(password) {
    if (!client || !user) throw new Error("Sign in before changing your password");
    const { error } = await client.auth.updateUser({ password });
    if (error) throw error;
  }

  async function deleteAccount() {
    if (!client || !user) throw new Error("Sign in before deleting your account");
    const { error } = await client.rpc("delete_own_account");
    if (error) throw error;
    await client.auth.signOut({ scope: "local" });
    user = null;
    emit();
  }

  async function saveBoard(id, board) {
    if (!client || !user) return false;
    const { error } = await client.from("canvases").upsert({
      id,
      user_id: user.id,
      title: board.title || "Untitled canvas",
      payload: board,
      object_count: (board.nodes?.length || 0) + (board.drawings?.length || 0),
      updated_at: board.updatedAt || new Date().toISOString(),
    }, { onConflict: "user_id,id" });
    if (error) throw error;
    return true;
  }

  async function loadBoard(id) {
    if (!client || !user) return null;
    const { data, error } = await client.from("canvases").select("payload").eq("id", id).maybeSingle();
    if (error) throw error;
    return data?.payload || null;
  }

  async function listBoards() {
    if (!client || !user) return [];
    const { data, error } = await client.from("canvases")
      .select("id,title,object_count,updated_at")
      .order("updated_at", { ascending: false });
    if (error) throw error;
    return (data || []).map((board) => ({
      id: board.id,
      title: board.title,
      objectCount: board.object_count,
      updatedAt: board.updated_at,
      cloud: true,
    }));
  }

  async function deleteBoard(id) {
    if (!client || !user) return false;
    const { error } = await client.from("canvases").delete().eq("id", id);
    if (error) throw error;
    return true;
  }

  global.ideaCanvasCloud = {
    configured,
    init,
    getUser: () => user,
    getLastAuthEvent: () => lastAuthEvent,
    onUserChange(listener) { listeners.add(listener); return () => listeners.delete(listener); },
    signIn,
    signUp,
    signOut,
    resendConfirmation,
    requestPasswordReset,
    updatePassword,
    deleteAccount,
    saveBoard,
    loadBoard,
    listBoards,
    deleteBoard,
  };
})(window);
