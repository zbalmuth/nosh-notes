-- Nosh Notes Supabase Schema
-- Run this in the Supabase SQL Editor to set up your database

-- Enable UUID extension
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- Lists table
CREATE TABLE IF NOT EXISTS lists (
  id UUID DEFAULT uuid_generate_v4() PRIMARY KEY,
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
  name TEXT NOT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Restaurants table
CREATE TABLE IF NOT EXISTS restaurants (
  id UUID DEFAULT uuid_generate_v4() PRIMARY KEY,
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
  name TEXT NOT NULL,
  address TEXT DEFAULT '',
  city TEXT DEFAULT '',
  state TEXT DEFAULT '',
  country TEXT DEFAULT '',
  phone TEXT DEFAULT '',
  website TEXT DEFAULT '',
  yelp_url TEXT DEFAULT '',
  google_url TEXT DEFAULT '',
  menu_url TEXT DEFAULT '',
  image_url TEXT DEFAULT '',
  photos TEXT[] DEFAULT '{}',
  price_level TEXT DEFAULT '',
  external_rating FLOAT,
  cuisine_tags TEXT[] DEFAULT '{}',
  lists TEXT[] DEFAULT '{"My Restaurants"}',
  is_favorite BOOLEAN DEFAULT FALSE,
  latitude FLOAT,
  longitude FLOAT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Dishes table
CREATE TABLE IF NOT EXISTS dishes (
  id UUID DEFAULT uuid_generate_v4() PRIMARY KEY,
  restaurant_id UUID REFERENCES restaurants(id) ON DELETE CASCADE NOT NULL,
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
  name TEXT NOT NULL,
  dish_type TEXT DEFAULT 'entree',
  rating FLOAT,
  want_to_try BOOLEAN DEFAULT FALSE,
  notes TEXT DEFAULT '',
  photos TEXT[] DEFAULT '{}',
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Row Level Security (RLS)
ALTER TABLE lists ENABLE ROW LEVEL SECURITY;
ALTER TABLE restaurants ENABLE ROW LEVEL SECURITY;
ALTER TABLE dishes ENABLE ROW LEVEL SECURITY;

-- Policies: Users can only see/modify their own data
CREATE POLICY "Users can view own lists" ON lists FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "Users can insert own lists" ON lists FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Users can update own lists" ON lists FOR UPDATE USING (auth.uid() = user_id);
CREATE POLICY "Users can delete own lists" ON lists FOR DELETE USING (auth.uid() = user_id);

CREATE POLICY "Users can view own restaurants" ON restaurants FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "Users can insert own restaurants" ON restaurants FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Users can update own restaurants" ON restaurants FOR UPDATE USING (auth.uid() = user_id);
CREATE POLICY "Users can delete own restaurants" ON restaurants FOR DELETE USING (auth.uid() = user_id);

CREATE POLICY "Users can view own dishes" ON dishes FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "Users can insert own dishes" ON dishes FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Users can update own dishes" ON dishes FOR UPDATE USING (auth.uid() = user_id);
CREATE POLICY "Users can delete own dishes" ON dishes FOR DELETE USING (auth.uid() = user_id);

-- Create default list on user signup (optional trigger)
CREATE OR REPLACE FUNCTION create_default_list()
RETURNS TRIGGER AS $$
BEGIN
  INSERT INTO lists (user_id, name) VALUES (NEW.id, 'My Restaurants');
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION create_default_list();

-- Storage bucket for dish photos (run in Supabase Dashboard > Storage)
-- Create a bucket named "dish-photos" with public access

-- User preferences (map position, etc.)
CREATE TABLE IF NOT EXISTS user_preferences (
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE PRIMARY KEY,
  map_lat FLOAT,
  map_lng FLOAT,
  map_zoom FLOAT,
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

ALTER TABLE user_preferences ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view own preferences" ON user_preferences FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "Users can insert own preferences" ON user_preferences FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Users can update own preferences" ON user_preferences FOR UPDATE USING (auth.uid() = user_id);

-- Indexes for performance
CREATE INDEX IF NOT EXISTS idx_restaurants_user_id ON restaurants(user_id);
CREATE INDEX IF NOT EXISTS idx_restaurants_city ON restaurants(city);
CREATE INDEX IF NOT EXISTS idx_restaurants_cuisine ON restaurants USING GIN(cuisine_tags);
CREATE INDEX IF NOT EXISTS idx_dishes_restaurant_id ON dishes(restaurant_id);
CREATE INDEX IF NOT EXISTS idx_dishes_user_id ON dishes(user_id);
