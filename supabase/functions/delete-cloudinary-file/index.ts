import { serve } from "https://deno.land/std@0.168.0/http/server.ts"

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  try {
    const { public_id, resource_type = 'image' } = await req.json()

    if (!public_id) {
      return new Response(JSON.stringify({ error: 'public_id is required' }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        status: 400,
      })
    }

    const CLOUDINARY_API_KEY = Deno.env.get('CLOUDINARY_API_KEY')
    const CLOUDINARY_API_SECRET = Deno.env.get('CLOUDINARY_API_SECRET')
    const CLOUDINARY_CLOUD_NAME = Deno.env.get('CLOUDINARY_CLOUD_NAME')

    if (!CLOUDINARY_API_KEY || !CLOUDINARY_API_SECRET || !CLOUDINARY_CLOUD_NAME) {
       return new Response(JSON.stringify({ error: 'Cloudinary credentials missing in environment variables' }), {
         headers: { ...corsHeaders, 'Content-Type': 'application/json' },
         status: 500,
       })
    }

    const timestamp = Math.floor(Date.now() / 1000)
    
    // Generate signature: SHA-1 of public_id=<id>&timestamp=<ts><api_secret>
    const strToSign = `public_id=${public_id}&timestamp=${timestamp}${CLOUDINARY_API_SECRET}`
    
    // Hash using Web Crypto API
    const encoder = new TextEncoder()
    const data = encoder.encode(strToSign)
    const hashBuffer = await crypto.subtle.digest('SHA-1', data)
    const hashArray = Array.from(new Uint8Array(hashBuffer))
    const signature = hashArray.map(b => b.toString(16).padStart(2, '0')).join('')

    const formData = new FormData()
    formData.append('public_id', public_id)
    formData.append('api_key', CLOUDINARY_API_KEY)
    formData.append('timestamp', timestamp.toString())
    formData.append('signature', signature)

    const url = `https://api.cloudinary.com/v1_1/${CLOUDINARY_CLOUD_NAME}/${resource_type}/destroy`
    
    const response = await fetch(url, {
      method: 'POST',
      body: formData
    })

    const result = await response.json()

    return new Response(JSON.stringify(result), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      status: response.ok ? 200 : 400,
    })
  } catch (error) {
    return new Response(JSON.stringify({ error: error.message }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      status: 500,
    })
  }
})
