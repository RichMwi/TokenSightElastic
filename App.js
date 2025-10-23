

import React, { useState, useEffect } from 'react';
import { SafeAreaView, View, Text, TextInput, Button, FlatList, TouchableOpacity, Alert, StyleSheet, ScrollView } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';

/*
  Features implemented in this prototype:
  - Simple signup/login using name + phone number (phone acts as password)
  - Two roles: Admin & User (admin identified by entering name 'admin')
  - Admin dashboard: create properties, attach comparables and documents (mock), assign properties to users
  - User dashboard: list assigned properties, view details, request valuation (mock AI), accept property / mint token (mock blockchain)
  - Mocked services:
    * Elastic-like hybrid search (simple substring / semantic placeholder)
    * AI valuation (stubbed logic that returns a first-pass valuation and reasoning)
    * Token minting (creates a local "token" object and stores it)

  This is intentionally simple to focus on flows; replace mocks with real API calls to Elastic/VertexAI/Gemini/Blockchain later.
*/

// ----- Mock services -----

const mockElasticSearch = async (query, properties) => {
  // Very simple hybrid search: exact match OR includes words
  const q = query.trim().toLowerCase();
  if (!q) return properties;
  return properties.filter(p => {
    return (
      (p.title && p.title.toLowerCase().includes(q)) ||
      (p.address && p.address.toLowerCase().includes(q)) ||
      (p.metadata && JSON.stringify(p.metadata).toLowerCase().includes(q))
    );
  });
};

const mockAIValuation = async (property) => {
  // Pretend to call VertexAI/Gemini and return a valuation
  // Use simple rule-of-thumb: base value + comparables average
  const base = property.estimatedValue || 100000;
  const comps = property.comparables || [];
  const compAvg = comps.length ? Math.round(comps.reduce((s,c)=>s+(c.value||0),0)/comps.length) : 0;
  const valuation = Math.round(base * 0.7 + compAvg * 0.3);
  const reasoning = `First-pass valuation: combined base estimate (${base}) and comparables average (${compAvg}). Recommended range: ${Math.round(valuation*0.9)} - ${Math.round(valuation*1.1)}.`;
  return { valuation, reasoning, confidence: comps.length ? 'medium' : 'low' };
};

const mockMintToken = async (owner, property) => {
  // Create a simple token object (mock blockchain mint)
  const token = {
    id: `TOKEN-${Math.random().toString(36).slice(2,9).toUpperCase()}`,
    owner,
    propertyId: property.id,
    mintedAt: new Date().toISOString(),
  };
  return token;
};

// ----- Helpers / Storage -----

const STORAGE_KEYS = {
  USERS: 'proto_users',
  PROPERTIES: 'proto_properties',
  TOKENS: 'proto_tokens'
};

const load = async (key, fallback) => {
  try {
    const raw = await AsyncStorage.getItem(key);
    return raw ? JSON.parse(raw) : fallback;
  } catch (e) { return fallback; }
};
const save = async (key, data) => {
  await AsyncStorage.setItem(key, JSON.stringify(data));
};

// ----- App -----

export default function App(){
  const [user, setUser] = useState(null);
  const [users, setUsers] = useState([]);
  const [properties, setProperties] = useState([]);
  const [tokens, setTokens] = useState([]);
  const [screen, setScreen] = useState('login');

  useEffect(()=>{
    (async ()=>{
      const u = await load(STORAGE_KEYS.USERS, []);
      const p = await load(STORAGE_KEYS.PROPERTIES, []);
      const t = await load(STORAGE_KEYS.TOKENS, []);
      setUsers(u);
      setProperties(p);
      setTokens(t);
    })();
  },[]);

  useEffect(()=>{ save(STORAGE_KEYS.USERS, users); }, [users]);
  useEffect(()=>{ save(STORAGE_KEYS.PROPERTIES, properties); }, [properties]);
  useEffect(()=>{ save(STORAGE_KEYS.TOKENS, tokens); }, [tokens]);

  // Simple role check
  const isAdmin = user && user.name && user.name.toLowerCase() === 'admin';

  if(!user) return <Login onLogin={(u)=>{ setUser(u); setScreen('dashboard'); }} users={users} setUsers={setUsers} />;

  return (
    <SafeAreaView style={{flex:1}}>
      <Header user={user} onLogout={()=>{ setUser(null); setScreen('login'); }} />
      {isAdmin ? (
        <AdminDashboard
          users={users}
          setUsers={setUsers}
          properties={properties}
          setProperties={setProperties}
          tokens={tokens}
          setTokens={setTokens}
        />
      ) : (
        <UserDashboard
          user={user}
          properties={properties}
          setProperties={setProperties}
          tokens={tokens}
          setTokens={setTokens}
        />
      )}
    </SafeAreaView>
  );
}

// ----- Components -----

function Header({user, onLogout}){
  return (
    <View style={styles.header}>
      <Text style={styles.headerText}>RWA Valuation Prototype</Text>
      <View style={{flexDirection:'row', alignItems:'center'}}>
        <Text style={{marginRight:10}}>{user.name}</Text>
        <Button title="Logout" onPress={onLogout} />
      </View>
    </View>
  );
}

function Login({onLogin, users, setUsers}){
  const [name, setName] = useState('');
  const [phone, setPhone] = useState('');

  const signupOrLogin = async () =>{
    if(!name || !phone) return Alert.alert('Enter name and phone');
    let found = users.find(u=>u.phone===phone);
    if(!found){
      // create user
      const newUser = { id: 'USER-'+Math.random().toString(36).slice(2,8), name, phone };
      const next = [...users, newUser];
      setUsers(next);
      await save(STORAGE_KEYS.USERS, next);
      onLogin(newUser);
    } else {
      // verify phone as password
      if(found.name !== name) return Alert.alert('Name does not match phone');
      onLogin(found);
    }
  };

  return (
    <SafeAreaView style={styles.center}>
      <Text style={{fontSize:18, marginBottom:8}}>Sign up / Login</Text>
      <TextInput placeholder="Name (enter 'admin' to access admin)" value={name} onChangeText={setName} style={styles.input} />
      <TextInput placeholder="Phone (used as password)" value={phone} onChangeText={setPhone} style={styles.input} keyboardType="phone-pad" />
      <Button title="Continue" onPress={signupOrLogin} />
      <View style={{height:20}} />
      <Text style={{color:'#666'}}>Demo: type name: admin and phone: 000 to access Admin dashboard</Text>
    </SafeAreaView>
  );
}

function AdminDashboard({users, setUsers, properties, setProperties, tokens, setTokens}){
  const [title, setTitle] = useState('');
  const [address, setAddress] = useState('');
  const [estimatedValue, setEstimatedValue] = useState('');
  const [assignedTo, setAssignedTo] = useState('');

  const createProperty = () =>{
    if(!title) return Alert.alert('Enter title');
    const prop = {
      id: 'PROP-'+Math.random().toString(36).slice(2,8),
      title, address, estimatedValue: Number(estimatedValue)||0,
      comparables: [], documents: [], assignedTo: assignedTo || null,
      createdAt: new Date().toISOString(),
      metadata: { source: 'admin-upload' }
    };
    setProperties([prop, ...properties]);
    setTitle(''); setAddress(''); setEstimatedValue(''); setAssignedTo('');
  };

  const assignToUser = (propId, userId) =>{
    setProperties(properties.map(p=> p.id===propId ? {...p, assignedTo: userId} : p));
  };

  const addComparable = (propId) =>{
    // quick prompt - in a real app this would be a modal/form
    const value = Math.round(Math.random()*100000 + 50000);
    setProperties(properties.map(p=> p.id===propId ? {...p, comparables: [...p.comparables, {id: 'C-'+Math.random().toString(36).slice(2,6), value}]} : p));
  };

  return (
    <ScrollView style={{padding:12}}>
      <Text style={styles.sectionTitle}>Create Property (Admin)</Text>
      <TextInput placeholder="Title" value={title} onChangeText={setTitle} style={styles.input} />
      <TextInput placeholder="Address" value={address} onChangeText={setAddress} style={styles.input} />
      <TextInput placeholder="Estimated value (number)" value={estimatedValue} onChangeText={setEstimatedValue} style={styles.input} keyboardType="numeric" />
      <TextInput placeholder="Assign to user id (optional)" value={assignedTo} onChangeText={setAssignedTo} style={styles.input} />
      <Button title="Create Property" onPress={createProperty} />

      <View style={{height:20}} />
      <Text style={styles.sectionTitle}>Properties</Text>
      {properties.length===0 ? <Text>No properties yet</Text> : (
        properties.map(p=> (
          <View key={p.id} style={styles.card}>
            <Text style={{fontWeight:'bold'}}>{p.title}</Text>
            <Text>{p.address}</Text>
            <Text>Estimate: {p.estimatedValue}</Text>
            <Text>AssignedTo: {p.assignedTo || '—'}</Text>
            <View style={{flexDirection:'row', gap:8, marginTop:8}}>
              <Button title="Add Comparable" onPress={()=>addComparable(p.id)} />
              <Button title="Assign (to first user)" onPress={()=>assignToUser(p.id, users[0]?.id || null)} />
            </View>
            <Text style={{marginTop:8}}>Comparables: {p.comparables?.length || 0}</Text>
          </View>
        ))
      )}

      <View style={{height:20}} />
      <Text style={styles.sectionTitle}>Users</Text>
      {users.length===0 ? <Text>No users yet</Text> : (
        users.map(u=> (
          <View key={u.id} style={styles.card}><Text>{u.name} — {u.phone} — {u.id}</Text></View>
        ))
      )}

      <View style={{height:20}} />
      <Text style={styles.sectionTitle}>Tokens (minted)</Text>
      {tokens.length===0 ? <Text>None yet</Text> : tokens.map(t=> (
        <View key={t.id} style={styles.card}><Text>{t.id} minted for {t.propertyId} by {t.owner.name || t.owner.phone}</Text></View>
      ))}

      <View style={{height:60}} />
    </ScrollView>
  );
}

function UserDashboard({user, properties, setProperties, tokens, setTokens}){
  const [query, setQuery] = useState('');
  const [results, setResults] = useState([]);
  const [assigned, setAssigned] = useState([]);

  useEffect(()=>{
    // derive assigned properties
    const a = properties.filter(p=> p.assignedTo === user.id);
    setAssigned(a);
    setResults(properties);
  }, [properties]);

  const doSearch = async () =>{
    const r = await mockElasticSearch(query, properties);
    setResults(r);
  };

  const requestValuation = async (prop) =>{
    const res = await mockAIValuation(prop);
    Alert.alert('AI Valuation', `Value: ${res.valuation}\nConfidence: ${res.confidence}\nReasoning: ${res.reasoning}`);
  };

  const acceptAndMint = async (prop) =>{
    // simple flow: user accepts -> mock mint -> save token
    const token = await mockMintToken(user, prop);
    const next = [token, ...tokens];
    setTokens(next);
    await save(STORAGE_KEYS.TOKENS, next);
    Alert.alert('Minted', `Token ${token.id} minted and assigned to you.`);
  };

  return (
    <ScrollView style={{padding:12}}>
      <Text style={styles.sectionTitle}>Search Properties (Elastic-like)</Text>
      <TextInput placeholder="Search by address, title, metadata..." value={query} onChangeText={setQuery} style={styles.input} />
      <Button title="Search" onPress={doSearch} />

      <View style={{height:12}} />
      <Text style={styles.sectionTitle}>Search Results</Text>
      {results.length===0 ? <Text>No results</Text> : results.map(p=> (
        <View key={p.id} style={styles.card}>
          <Text style={{fontWeight:'600'}}>{p.title}</Text>
          <Text>{p.address}</Text>
          <Text>Estimate: {p.estimatedValue}</Text>
          <Text>Comparables: {p.comparables?.length || 0}</Text>
          <View style={{flexDirection:'row', gap:8, marginTop:8}}>
            <Button title="Request AI Valuation" onPress={()=>requestValuation(p)} />
            <Button title="Accept & Mint" onPress={()=>acceptAndMint(p)} />
          </View>
        </View>
      ))}

      <View style={{height:12}} />
      <Text style={styles.sectionTitle}>Your Assigned Properties</Text>
      {assigned.length===0 ? <Text>No assigned properties</Text> : assigned.map(p=> (
        <View key={p.id} style={styles.card}>
          <Text style={{fontWeight:'600'}}>{p.title}</Text>
          <Text>{p.address}</Text>
          <Text>Estimate: {p.estimatedValue}</Text>
          <View style={{flexDirection:'row', gap:8, marginTop:8}}>
            <Button title="Request AI Valuation" onPress={()=>requestValuation(p)} />
            <Button title="Accept & Mint" onPress={()=>acceptAndMint(p)} />
          </View>
        </View>
      ))}

      <View style={{height:12}} />
      <Text style={styles.sectionTitle}>Your Tokens</Text>
      {tokens.filter(t=> t.owner && t.owner.phone === user.phone).length===0 ? <Text>No tokens yet</Text> : (
        tokens.filter(t=> t.owner && t.owner.phone === user.phone).map(t=> (
          <View key={t.id} style={styles.card}><Text>{t.id} — {t.propertyId} — {new Date(t.mintedAt).toLocaleString()}</Text></View>
        ))
      )}

      <View style={{height:60}} />
    </ScrollView>
  );
}

// ----- Styles -----

const styles = StyleSheet.create({
  center: {flex:1, alignItems:'center', justifyContent:'center', padding:16},
  input: {borderWidth:1, borderColor:'#ddd', padding:8, borderRadius:6, width:'100%', marginBottom:8},
  header: {height:60, backgroundColor:'#0b5cff', padding:12, flexDirection:'row', justifyContent:'space-between', alignItems:'center'},
  headerText: {color:'#fff', fontWeight:'700', fontSize:16},
  sectionTitle: {fontSize:16, fontWeight:'700', marginVertical:8},
  card: {padding:10, borderRadius:8, borderWidth:1, borderColor:'#eee', marginBottom:8, backgroundColor:'#fff'},
});

/*
  Next steps to replace mocks with real systems:
  - Integrate Elastic hybrid search by calling your Elastic endpoint from `mockElasticSearch`.
  - Replace `mockAIValuation` with a call to Google Vertex AI / Gemini that returns structured reasoning and valuations.
  - Replace `mockMintToken` with blockchain mint logic (e.g., Solana/Ethereum smart contract interaction). Store token proof on-chain and mirror details into backend.
  - Add approvals: when user requests valuation, create a valuation record that a human valuer reviews and approves before minting.
  - Add audit trail: store all actions (search queries, AI responses, approvals) in a backend DB for compliance.
*/
