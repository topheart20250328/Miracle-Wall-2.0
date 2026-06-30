async function fetchAllEntryIds() {
  if (!supabaseClient) return;
  try {
    const { data, error } = await supabaseClient
      .from("wall_stickers")
      .select("id")
      .order("created_at", { ascending: true });
      
    if (error) throw error;
    
    state.allEntryIds = data.map(x => x.id);
  } catch (e) {
    console.error("Failed to fetch sequence", e);
  }
}
