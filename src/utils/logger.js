import { supabase } from '../supabaseClient'

export const logActivity = async ({ userId = null, userRole, action, details }) => {
  try {
    let aktor = userRole;
    if (userId) {
      aktor = `${userRole}`;
    }
    const { error } = await supabase.from('activity_log').insert({
      aktor: aktor,
      aksi: action,
      detail: details
    })
    if (error) {
      console.error('Failed to log activity:', error.message)
    }
  } catch (err) {
    console.error('Error logging activity:', err)
  }
}
